import { ConsultarComprobante } from '../src/application/consultar-comprobante.js';
import { EmitirComprobante } from '../src/application/emitir-comprobante.js';
import { EmitirComprobanteAuditado } from '../src/application/emitir-comprobante-auditado.js';
import type { EmitirComprobanteComando } from '../src/application/ports/comprobante.port.js';
import { Comprobante } from '../src/domain/comprobante/comprobante.js';
import {
  BoletaRequiereAdquirenteError,
  CodigoSunatInvalidoError,
  ComprobanteNoEncontradoError,
  CuotasInvalidasError,
  DatosComprobanteInvalidosError,
  EmisionConcurrenteError,
  EmisorNoEncontradoError,
  EmisorNoHabilitadoError,
  FacturaRequiereRucError,
  IdempotenciaConflictoError,
  SerieAmbiguaError,
  SerieNoCorrespondeError,
  SucursalNoEncontradaError,
  TasaIgvNoVigenteError,
  TotalNoCoincideError,
} from '../src/domain/errores.js';
import { EVENTOS_FE } from '../src/domain/eventos-fe.js';
import { ESQUEMAS_FE } from '../src/infrastructure/event-schemas.js';
import { EMPRESA, EMPRESA_DE_B, TENANT_A, TENANT_B, USUARIO } from './support/dobles.js';
import {
  crearDoblesEmision,
  emisorEn,
  RUC_CAIDO,
  RUC_CLIENTE,
  RUC_NO_HABIDO,
  SUCURSAL,
  SUCURSAL_2,
  SUCURSAL_DE_B,
  type DoblesEmision,
} from './support/dobles-emision.js';

const CLAVE = '0193f3a0-0000-7000-8000-00000000c1a1';
const OTRA_CLAVE = '0193f3a0-0000-7000-8000-00000000c1a2';

function factura(cambios: Partial<EmitirComprobanteComando> = {}): EmitirComprobanteComando {
  return {
    tipo: 'FACTURA',
    empresaId: EMPRESA,
    sucursalId: SUCURSAL,
    moneda: 'PEN',
    formaPago: 'CONTADO',
    adquirente: { tipoDocumento: 'RUC', numero: RUC_CLIENTE, nombre: 'CLIENTE SAC' },
    lineas: [
      { descripcion: 'Catering', unidad: 'ZZ', cantidad: '1', valorUnitario: '60.00', afectacionIgv: '10' },
      { descripcion: 'Bebidas', unidad: 'NIU', cantidad: '4', valorUnitario: '10', afectacionIgv: '10' },
    ],
    origen: { producto: 'SAZON', id: 'venta-1' },
    claveIdempotencia: CLAVE,
    ...cambios,
  };
}

function boleta(valorUnitario: string, cambios: Partial<EmitirComprobanteComando> = {}): EmitirComprobanteComando {
  return {
    tipo: 'BOLETA',
    empresaId: EMPRESA,
    sucursalId: SUCURSAL,
    moneda: 'PEN',
    formaPago: 'CONTADO',
    lineas: [{ descripcion: 'Menú', unidad: 'NIU', cantidad: '1', valorUnitario, afectacionIgv: '20' }],
    claveIdempotencia: CLAVE,
    ...cambios,
  };
}

describe('EmitirComprobante (TR-RF-053 y 054)', () => {
  let dobles: DoblesEmision;
  let emision: EmitirComprobante;
  const emitir = (comando: EmitirComprobanteComando) => emision.emitir(comando);
  const enTenantB = <Resultado>(trabajo: () => Promise<Resultado>) => dobles.contexto.run({ tenantId: TENANT_B, actorId: USUARIO }, trabajo);

  beforeEach(() => {
    dobles = crearDoblesEmision();
    emision = new EmitirComprobante(dobles);
  });

  it('TR-CA-136: F001 en 99, factura a un RUC con 2 líneas de S/ 100,00 → F001-00000100, IGV 18,00, total 118,00, PENDIENTE_ENVIO', async () => {
    const emitido = await emitir(factura({ totalEsperado: '118.00' }));
    expect(emitido).toMatchObject({
      serie: 'F001',
      numero: 100,
      numeroFormateado: 'F001-00000100',
      estado: 'PENDIENTE_ENVIO',
      totales: { gravado: '100.00', exonerado: '0.00', inafecto: '0.00', igv: '18.00', total: '118.00' },
      advertencias: [],
      repetido: false,
    });
    expect(dobles.seriesMemoria.ultimo('F001')).toBe(100);
    const [guardado] = dobles.comprobantes.filas;
    expect(guardado.datos).toMatchObject({ tenantId: TENANT_A, fechaEmision: '2026-11-22', creadoPor: USUARIO, regimenIgv: 'GENERAL' });
    expect(guardado.datos.tasaIgv.aTexto()).toBe('0.1800');
  });

  it('cpe.emitido se publica una vez, en la transacción, y cumple su esquema sin datos del adquirente', async () => {
    const emitido = await emitir(factura());
    expect(dobles.publicador.tipos()).toEqual([EVENTOS_FE.comprobanteEmitido]);
    expect(dobles.publicador.enTransaccion).toEqual([true]);
    const carga = dobles.publicador.eventos[0].payload as Record<string, unknown>;
    expect(carga).toMatchObject({ comprobante_id: emitido.comprobanteId, tipo: '01', numero: 100, total: '118.00' });
    expect(Object.keys(carga).sort()).toEqual(Object.keys((ESQUEMAS_FE[EVENTOS_FE.comprobanteEmitido] as { properties: object }).properties).sort());
    expect(JSON.stringify(carga)).not.toContain(RUC_CLIENTE);
  });

  it('TR-CA-138: la misma clave con el mismo contenido devuelve la misma factura (repetido) y el correlativo no avanza', async () => {
    const primera = await emitir(factura());
    // Mismo contenido con otra escritura de los montos y otro orden de propiedades.
    const segunda = await emitir({ ...factura(), lineas: factura().lineas.map((linea) => ({ ...linea, valorUnitario: `${Number(linea.valorUnitario)}.0` })) });
    expect(segunda).toEqual({ ...primera, repetido: true });
    expect([dobles.seriesMemoria.ultimo('F001'), dobles.seriesMemoria.pedidos, dobles.comprobantes.filas.length]).toEqual([100, 1, 1]);
    expect(dobles.publicador.tipos()).toEqual([EVENTOS_FE.comprobanteEmitido]);
  });

  it('TR-CA-138: la misma clave con otro contenido → IDEMPOTENCIA_CONFLICTO sin número', async () => {
    await emitir(factura());
    await expect(emitir(factura({ totalEsperado: '118.00' }))).rejects.toThrow(IdempotenciaConflictoError);
    await expect(emitir(boleta('10'))).rejects.toThrow(IdempotenciaConflictoError);
    expect(dobles.seriesMemoria.pedidos).toBe(1);
  });

  it('TR-CA-137: factura con DNI → FACTURA_REQUIERE_RUC sin consumir número', async () => {
    await expect(emitir(factura({ adquirente: { tipoDocumento: 'DNI', numero: '12345678', nombre: 'PERSONA' } }))).rejects.toThrow(
      'La factura requiere RUC del adquirente',
    );
    await expect(emitir(factura({ adquirente: undefined }))).rejects.toThrow(FacturaRequiereRucError);
    expect(dobles.seriesMemoria.ultimo('F001')).toBe(99);
  });

  it('TR-CA-139, 140 y 141: boleta sin adquirente hasta el umbral (incluido) va a CLIENTES VARIOS; por encima, 422', async () => {
    await emitir(boleta('45.50'));
    expect(dobles.comprobantes.filas[0].datos.adquirente).toMatchObject({ tipoDocumento: 'DOC_0', numero: '0', nombre: 'CLIENTES VARIOS' });

    await expect(emitir(boleta('850', { claveIdempotencia: OTRA_CLAVE }))).rejects.toThrow(
      new BoletaRequiereAdquirenteError('S/ 700,00'),
    );
    expect(dobles.seriesMemoria.ultimo('B001')).toBe(1);

    const exacta = await emitir(boleta('700', { claveIdempotencia: OTRA_CLAVE }));
    expect([exacta.numeroFormateado, exacta.totales.total]).toEqual(['B001-00000002', '700.00']);
  });

  it('el umbral es el del parámetro: en 500 la boleta de S/ 600 sin adquirente se rechaza con S/ 500,00', async () => {
    dobles.parametros.umbral = 500;
    await expect(emitir(boleta('600'))).rejects.toThrow('Boletas mayores a S/ 500,00');
  });

  it('TR-RN-019: RUC NO HABIDO y no ACTIVO se emite con advertencias; padrón sin datos o caído, sin advertencia', async () => {
    const conAdvertencia = await emitir(factura({ adquirente: { tipoDocumento: 'RUC', numero: RUC_NO_HABIDO, nombre: 'NO HABIDO SAC' } }));
    expect(conAdvertencia.advertencias.map((advertencia) => advertencia.codigo)).toEqual(['RUC_NO_ACTIVO', 'RUC_NO_HABIDO']);
    expect(dobles.comprobantes.filas[0].datos.advertencias).toHaveLength(2);

    const sinDatos = await emitir(factura({ claveIdempotencia: OTRA_CLAVE }));
    expect(sinDatos.advertencias).toEqual([]);

    const caido = await emitir(
      factura({ claveIdempotencia: '0193f3a0-0000-7000-8000-00000000c1a3', adquirente: { tipoDocumento: 'RUC', numero: RUC_CAIDO, nombre: 'X SAC' } }),
    );
    expect([caido.numero, caido.advertencias]).toEqual([102, []]);
    expect(dobles.avisos).toEqual(['fe.padron.no_disponible']);
  });

  it.each([
    ['unidad', factura({ lineas: [{ descripcion: 'X', unidad: 'XYZ', cantidad: '1', valorUnitario: '1', afectacionIgv: '10' }] }), 'lineas.0.unidad'],
    ['afectación inexistente', factura({ lineas: [{ descripcion: 'X', unidad: 'NIU', cantidad: '1', valorUnitario: '1', afectacionIgv: '99' }] }), 'lineas.0.afectacionIgv'],
    ['afectación gratuita', factura({ lineas: [{ descripcion: 'X', unidad: 'NIU', cantidad: '1', valorUnitario: '1', afectacionIgv: '11' }] }), 'lineas.0.afectacionIgv'],
    ['afectación IVAP', factura({ lineas: [{ descripcion: 'X', unidad: 'NIU', cantidad: '1', valorUnitario: '1', afectacionIgv: '17' }] }), 'lineas.0.afectacionIgv'],
    ['tipo de documento', factura({ adquirente: { tipoDocumento: 'LIBRETA', numero: '1', nombre: 'X' } }), 'adquirente.tipoDocumento'],
  ])('código SUNAT inexistente o no admitido (%s) → 422 con el campo, sin consumir número', async (_caso, comando, campo) => {
    const error = await emitir(comando).catch((rechazo: unknown) => rechazo);
    expect(error).toBeInstanceOf(CodigoSunatInvalidoError);
    expect((error as CodigoSunatInvalidoError).campo).toBe(campo);
    expect(dobles.seriesMemoria.pedidos).toBe(0);
  });

  it('moneda que CAT no tiene vigente → 422 con el campo moneda', async () => {
    delete dobles.catalogo.items.MONEDA.USD;
    await expect(emitir(factura({ moneda: 'USD' }))).rejects.toMatchObject({ code: 'CODIGO_SUNAT_INVALIDO', campo: 'moneda' });
  });

  it('crédito sin cuotas, que no suman o con vencimiento no posterior → CUOTAS_INVALIDAS; con cuotas correctas se emite y se guardan', async () => {
    await expect(emitir(factura({ formaPago: 'CREDITO' }))).rejects.toThrow(CuotasInvalidasError);
    await expect(emitir(factura({ formaPago: 'CREDITO', cuotas: [{ monto: '100', fechaVencimiento: '2026-12-22' }] }))).rejects.toThrow(CuotasInvalidasError);
    await expect(emitir(factura({ formaPago: 'CREDITO', cuotas: [{ monto: '118', fechaVencimiento: '2026-11-22' }] }))).rejects.toThrow(CuotasInvalidasError);
    expect(dobles.seriesMemoria.pedidos).toBe(0);

    const cuotas = [
      { monto: '59', fechaVencimiento: '2026-12-22' },
      { monto: '59.00', fechaVencimiento: '2027-01-22' },
    ];
    await emitir(factura({ formaPago: 'CREDITO', cuotas }));
    expect(dobles.comprobantes.filas[0].datos.cuotas.map((cuota) => [cuota.numero, cuota.monto.aTexto(), cuota.fechaVencimiento])).toEqual([
      [1, '59.00', '2026-12-22'],
      [2, '59.00', '2027-01-22'],
    ]);
  });

  it('fecha o monto sin formato → DATOS_COMPROBANTE_INVALIDOS antes de abrir nada', async () => {
    await expect(emitir(factura({ formaPago: 'CREDITO', cuotas: [{ monto: '118', fechaVencimiento: '2026-02-30' }] }))).rejects.toThrow(
      DatosComprobanteInvalidosError,
    );
    await expect(emitir(factura({ totalEsperado: '1,00' }))).rejects.toThrow(DatosComprobanteInvalidosError);
  });

  it('totalEsperado: difiere en más de S/ 0,01 → 422; en 0,01 se emite con el calculado', async () => {
    await expect(emitir(factura({ totalEsperado: '118.02' }))).rejects.toThrow(TotalNoCoincideError);
    const emitido = await emitir(factura({ totalEsperado: '117.99' }));
    expect(emitido.totales.total).toBe('118.00');
  });

  it('la tasa es la vigente del régimen del emisor: dos vigencias de REDUCIDO_RESTAURANTES dan IGV distinto; sin tasa vigente, 409', async () => {
    dobles.emisores.filas[0] = emisorEn('PRODUCCION', 'REDUCIDO_RESTAURANTES');
    const en2026 = await emitir(boleta('100', { lineas: [{ descripcion: 'Menú', unidad: 'NIU', cantidad: '1', valorUnitario: '100', afectacionIgv: '10' }] }));
    expect([en2026.totales.igv, en2026.totales.total]).toEqual(['10.50', '110.50']);

    // El 1 de enero de 2027 el ítem pasa a la vigencia siguiente (12 % + 3 %), sin tocar código.
    dobles.catalogo.items.TASA_IGV.REDUCIDO_RESTAURANTES = { tasa: '0.15' };
    const en2027 = await emitir(
      boleta('100', { claveIdempotencia: OTRA_CLAVE, lineas: [{ descripcion: 'Menú', unidad: 'NIU', cantidad: '1', valorUnitario: '100', afectacionIgv: '10' }] }),
    );
    expect([en2027.totales.igv, en2027.totales.total]).toEqual(['15.00', '115.00']);

    delete dobles.catalogo.items.TASA_IGV.REDUCIDO_RESTAURANTES;
    await expect(emitir(boleta('100', { claveIdempotencia: '0193f3a0-0000-7000-8000-00000000c1a3' }))).rejects.toThrow(TasaIgvNoVigenteError);
  });

  it.each(['BORRADOR', 'CONFIGURADO'] as const)('emisor en %s → EMISOR_NO_HABILITADO; sin emisor → EMISOR_NO_ENCONTRADO', async (estado) => {
    dobles.emisores.filas[0] = emisorEn(estado);
    await expect(emitir(factura())).rejects.toThrow(EmisorNoHabilitadoError);
    dobles.emisores.filas = [];
    await expect(emitir(factura())).rejects.toThrow(EmisorNoEncontradoError);
    expect(dobles.seriesMemoria.pedidos).toBe(0);
  });

  it('serie: la de otra sucursal → 422; sin serie y dos activas del tipo → «Indique la serie»; la enviada activa se usa', async () => {
    await expect(emitir(factura({ serie: 'F002' }))).rejects.toThrow(SerieNoCorrespondeError);
    dobles.seriesMemoria.series.push({ ...dobles.seriesMemoria.series[2], sucursalId: SUCURSAL });
    await expect(emitir(factura())).rejects.toThrow(new SerieAmbiguaError());
    expect((await emitir(factura({ serie: 'F002' }))).numeroFormateado).toBe('F002-00000001');
  });

  it('sucursal sin serie del tipo → 422; sucursal de otra empresa o tenant → SUCURSAL_NO_ENCONTRADA', async () => {
    await expect(emitir(boleta('10', { sucursalId: SUCURSAL_2 }))).rejects.toThrow(SerieNoCorrespondeError);
    await expect(emitir(factura({ sucursalId: SUCURSAL_DE_B }))).rejects.toThrow(SucursalNoEncontradaError);
  });

  it('TR-CA-095 desde FE: si la transacción del llamador se revierte, ni el número ni el comprobante quedan', async () => {
    await expect(
      dobles.unidadDeTrabajo.run(async () => {
        await emitir(factura());
        throw new Error('el producto falla después de emitir');
      }),
    ).rejects.toThrow('el producto falla');
    expect([dobles.seriesMemoria.ultimo('F001'), dobles.comprobantes.filas.length, dobles.publicador.eventos.length]).toEqual([99, 0, 0]);
    expect((await emitir(factura())).numero).toBe(100);
  });

  it('TR-RNF-010: otro tenant no ve el comprobante ni numera sobre la empresa de A', async () => {
    const emitido = await emitir(factura());
    const consultar = new ConsultarComprobante(dobles);
    await expect(enTenantB(() => consultar.ejecutar(emitido.comprobanteId))).rejects.toThrow(ComprobanteNoEncontradoError);
    await expect(enTenantB(() => emitir(factura({ claveIdempotencia: OTRA_CLAVE })))).rejects.toThrow(EmisorNoEncontradoError);
    // Con la misma clave, B emite lo suyo: la clave es por tenant.
    const deB = await enTenantB(() => emitir(factura({ empresaId: EMPRESA_DE_B, sucursalId: SUCURSAL_DE_B })));
    expect([deB.numeroFormateado, deB.repetido]).toEqual(['F001-00000001', false]);
    expect((await consultar.ejecutar(emitido.comprobanteId)).lineas).toHaveLength(2);
  });
});

describe('EmitirComprobanteAuditado (entrada HTTP)', () => {
  it('audita la emisión en la misma transacción y no la repetición', async () => {
    const dobles = crearDoblesEmision();
    const auditado = new EmitirComprobanteAuditado({ unidadDeTrabajo: dobles.unidadDeTrabajo, auditoria: dobles.base.auditoria, emision: new EmitirComprobante(dobles) });
    const emitido = await auditado.ejecutar(factura());
    await auditado.ejecutar(factura());
    expect(dobles.base.auditoria.entradas).toEqual([
      expect.objectContaining({ accion: 'fe.comprobante.emitir', entidadTipo: 'comprobante_fe', entidadId: emitido.comprobanteId }),
    ]);
  });

  it('si otra petición con la misma clave confirmó primero, reintenta y devuelve la existente sin otro número', async () => {
    const dobles = crearDoblesEmision();
    const real = new EmitirComprobante(dobles);
    // La otra petición confirmó mientras esta calculaba: al guardar, esta chocó con la clave y se revirtió.
    await real.emitir(factura());
    let carreras = 0;
    const conCarrera = {
      emitir: (comando: EmitirComprobanteComando) => {
        carreras += 1;
        return carreras === 1 ? Promise.reject(new EmisionConcurrenteError()) : real.emitir(comando);
      },
    };
    const auditado = new EmitirComprobanteAuditado({ unidadDeTrabajo: dobles.unidadDeTrabajo, auditoria: dobles.base.auditoria, emision: conCarrera });
    const resultado = await auditado.ejecutar(factura());
    expect([resultado.repetido, resultado.numero, dobles.comprobantes.filas.length]).toEqual([true, 100, 1]);
  });

  it('otros errores no se reintentan', async () => {
    const dobles = crearDoblesEmision();
    let intentos = 0;
    const falla = {
      emitir: () => {
        intentos += 1;
        return Promise.reject(new EmisorNoHabilitadoError());
      },
    };
    const auditado = new EmitirComprobanteAuditado({ unidadDeTrabajo: dobles.unidadDeTrabajo, auditoria: dobles.base.auditoria, emision: falla });
    await expect(auditado.ejecutar(factura())).rejects.toThrow(EmisorNoHabilitadoError);
    expect(intentos).toBe(1);
  });

  it('el repositorio en memoria choca con la clave repetida como uq_comprobante_idempotencia', async () => {
    const dobles = crearDoblesEmision();
    await new EmitirComprobante(dobles).emitir(factura());
    await expect(dobles.comprobantes.guardar(Comprobante.reconstituir({ ...dobles.comprobantes.filas[0].datos }))).rejects.toThrow(EmisionConcurrenteError);
  });
});
