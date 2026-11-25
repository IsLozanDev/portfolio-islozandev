import { CLIENTES_VARIOS } from '../src/domain/comprobante/adquirente.js';
import { Comprobante, prepararEmision, type DatosEmision } from '../src/domain/comprobante/comprobante.js';
import { Decimal, ESCALA_TASA, ESCALA_UNITARIO, formatearSoles, monto, redondear2 } from '../src/domain/comprobante/dinero.js';
import { huellaDeSolicitud } from '../src/domain/comprobante/huella-solicitud.js';
import { calcularLinea, type EntradaLinea, type GrupoAfectacion } from '../src/domain/comprobante/linea-comprobante.js';
import { advertenciasDelPadron, exigirCuotas } from '../src/domain/comprobante/reglas-factura.js';
import { exigirSerieDelTipo, formatearNumero, tipoDesdeCodigo } from '../src/domain/comprobante/tipo-comprobante.js';
import { calcularTotales, verificarTotalEsperado } from '../src/domain/comprobante/totales.js';
import { Emisor } from '../src/domain/emisor.js';
import {
  BoletaRequiereAdquirenteError,
  CuotasInvalidasError,
  DatosComprobanteInvalidosError,
  EmisorNoHabilitadoError,
  FacturaRequiereRucError,
  SerieNoCorrespondeError,
  TotalNoCoincideError,
} from '../src/domain/errores.js';
import { EVENTOS_FE } from '../src/domain/eventos-fe.js';

const TASA_GENERAL = Decimal.desdeTexto('0.18', ESCALA_TASA, 'tasa');
const TASA_REDUCIDA = Decimal.desdeTexto('0.105', ESCALA_TASA, 'tasa');
const UMBRAL = monto('700', 'umbral');
const RUC_VALIDO = '20512345671';
const FECHA = '2026-11-24';

function linea(cantidad: string, valorUnitario: string, grupo: GrupoAfectacion = 'GRAVADO'): EntradaLinea {
  const afectacion = { GRAVADO: '10', EXONERADO: '20', INAFECTO: '30' }[grupo];
  return {
    codigo: null,
    descripcion: 'Ítem',
    unidad: 'NIU',
    cantidad: Decimal.desdeTexto(cantidad, ESCALA_UNITARIO, 'cantidad'),
    valorUnitario: Decimal.desdeTexto(valorUnitario, ESCALA_UNITARIO, 'valorUnitario'),
    afectacionIgv: afectacion,
    grupo,
  };
}

function datos(cambios: Partial<DatosEmision> = {}): DatosEmision {
  return {
    id: '0193f3a0-0000-7000-8000-0000000000c1',
    tenantId: 't',
    empresaId: 'e',
    sucursalId: 's',
    emisorId: 'em',
    tipo: 'FACTURA',
    serie: 'F001',
    fechaEmision: FECHA,
    moneda: 'PEN',
    formaPago: 'CONTADO',
    cuotas: [],
    adquirente: { tipoDocumento: 'RUC', numero: RUC_VALIDO, nombre: 'CLIENTE SAC', correo: null, personaId: null },
    lineas: [linea('1', '60'), linea('4', '10')],
    totalEsperado: null,
    modoEnvio: 'INDIVIDUAL',
    origen: { producto: 'SAZON', id: 'venta-1' },
    claveIdempotencia: 'clave',
    huellaSolicitud: 'a'.repeat(64),
    advertencias: [],
    regimenIgv: 'GENERAL',
    tasaIgv: TASA_GENERAL,
    umbralBoleta: UMBRAL,
    creadoPor: null,
    creadoEn: new Date(`${FECHA}T15:00:00Z`),
    ...cambios,
  };
}

const boleta = (cambios: Partial<DatosEmision>) => datos({ tipo: 'BOLETA', serie: 'B001', adquirente: null, ...cambios });
const cuota = (montoCuota: string, fechaVencimiento: string, numero = 1) => ({ numero, monto: monto(montoCuota, 'monto'), fechaVencimiento });

describe('Decimal sin coma flotante (TR-RN-021)', () => {
  it('suma y multiplica sin errores de punto flotante: 0.1 + 0.2 = 0.30', () => {
    expect(monto('0.1', 'a').sumar(monto('0.2', 'b')).aTexto()).toBe('0.30');
    expect(monto('1.10', 'a').multiplicar(monto('3', 'b'), 2).aTexto()).toBe('3.30');
  });

  it('redondea mitad hacia arriba en el borde ,005 y en negativos se aleja del cero', () => {
    expect(redondear2(Decimal.desdeTexto('1.005', ESCALA_UNITARIO, 'x')).aTexto()).toBe('1.01');
    expect(redondear2(Decimal.desdeTexto('1.0049', ESCALA_UNITARIO, 'x')).aTexto()).toBe('1.00');
    expect(monto('0', 'a').restar(Decimal.desdeTexto('0.005', ESCALA_UNITARIO, 'b')).aTexto()).toBe('-0.01');
    expect(Decimal.desdeTexto('2.5', 1, 'x').aEscala(0).aTexto()).toBe('3');
  });

  it('rechaza negativos, texto, más decimales que la escala o más enteros que la columna', () => {
    for (const invalido of ['-1', 'abc', '1.234', '1,00', '1234567890123']) {
      expect(() => monto(invalido, 'total')).toThrow(DatosComprobanteInvalidosError);
    }
    expect(() => Decimal.desdeTexto('12345678901', ESCALA_UNITARIO, 'cantidad')).toThrow(/cantidad/);
    expect(Decimal.desdeTexto('0000000000000001', ESCALA_UNITARIO, 'cantidad').aTexto()).toBe('1.0000');
  });

  it('compara entre escalas y formatea en soles', () => {
    expect(monto('1', 'a').compararCon(Decimal.desdeTexto('1.0000', ESCALA_UNITARIO, 'b'))).toBe(0);
    expect(monto('2', 'a').compararCon(monto('1', 'b'))).toBe(1);
    expect(monto('1', 'a').compararCon(monto('2', 'b'))).toBe(-1);
    expect(monto('0', 'a').esCero()).toBe(true);
    expect(formatearSoles(UMBRAL)).toBe('S/ 700,00');
    expect(Decimal.cero(0).aTexto()).toBe('0');
  });
});

describe('Cálculo por línea y totales (TR-RN-021)', () => {
  it('TR-CA-136: S/ 100,00 de valor de venta → IGV 18,00 y total 118,00', () => {
    const lineas = [calcularLinea(linea('1', '60'), 1, TASA_GENERAL), calcularLinea(linea('4', '10'), 2, TASA_GENERAL)];
    const totales = calcularTotales(lineas);
    expect(lineas.map((calculada) => [calculada.valorVenta.aTexto(), calculada.igv.aTexto(), calculada.precioUnitario.aTexto()])).toEqual([
      ['60.00', '10.80', '70.8000'],
      ['40.00', '7.20', '11.8000'],
    ]);
    expect([totales.gravado, totales.igv, totales.total].map((valor) => valor.aTexto())).toEqual(['100.00', '18.00', '118.00']);
  });

  it('redondea el IGV por línea: 3 × 0,3333 → 1,00 de valor y 0,18 de IGV; la suma de las líneas manda', () => {
    const calculada = calcularLinea(linea('3', '0.3333'), 1, TASA_GENERAL);
    expect([calculada.valorVenta.aTexto(), calculada.igv.aTexto()]).toEqual(['1.00', '0.18']);
    const totales = calcularTotales([calculada, calcularLinea(linea('1', '0.025'), 2, TASA_GENERAL)]);
    // 0,025 → 0,03 de valor y 0,0054 → 0,01 de IGV.
    expect([totales.gravado.aTexto(), totales.igv.aTexto(), totales.total.aTexto()]).toEqual(['1.03', '0.19', '1.22']);
  });

  it('exonerado e inafecto no llevan IGV y suman en su total; el precio unitario es el valor unitario', () => {
    const exonerada = calcularLinea(linea('2', '5', 'EXONERADO'), 1, TASA_GENERAL);
    const inafecta = calcularLinea(linea('1', '7.5', 'INAFECTO'), 2, TASA_GENERAL);
    const totales = calcularTotales([exonerada, inafecta, calcularLinea(linea('1', '10'), 3, TASA_GENERAL)]);
    expect([exonerada.igv.aTexto(), exonerada.precioUnitario.aTexto(), inafecta.igv.aTexto()]).toEqual(['0.00', '5.0000', '0.00']);
    expect([totales.gravado, totales.exonerado, totales.inafecto, totales.igv, totales.total].map((valor) => valor.aTexto())).toEqual([
      '10.00',
      '10.00',
      '7.50',
      '1.80',
      '29.30',
    ]);
  });

  it('tasa reducida de restaurantes (10,5 % en 2026): S/ 100,00 → IGV 10,50', () => {
    const totales = calcularTotales([calcularLinea(linea('1', '100'), 1, TASA_REDUCIDA)]);
    expect([totales.igv.aTexto(), totales.total.aTexto()]).toEqual(['10.50', '110.50']);
  });

  it('tolerancia de S/ 0,01 con el total esperado: hasta 0,01 pasa, 0,02 no', () => {
    const total = monto('118.00', 'total');
    expect(() => verificarTotalEsperado(total, null)).not.toThrow();
    expect(() => verificarTotalEsperado(total, monto('118.01', 'esperado'))).not.toThrow();
    expect(() => verificarTotalEsperado(total, monto('117.99', 'esperado'))).not.toThrow();
    expect(() => verificarTotalEsperado(total, monto('118.02', 'esperado'))).toThrow(TotalNoCoincideError);
  });
});

describe('Reglas de factura y boleta', () => {
  it('TR-CA-137: factura con DNI, sin adquirente o con RUC de dígito verificador inválido → FACTURA_REQUIERE_RUC', () => {
    const dni = { tipoDocumento: 'DNI', numero: '12345678', nombre: 'PERSONA', correo: null, personaId: null };
    expect(() => prepararEmision(datos({ adquirente: dni }))).toThrow(new FacturaRequiereRucError());
    expect(() => prepararEmision(datos({ adquirente: null }))).toThrow(FacturaRequiereRucError);
    expect(() => prepararEmision(datos({ adquirente: { ...dni, tipoDocumento: 'RUC', numero: '20512345678' } }))).toThrow(FacturaRequiereRucError);
  });

  it('TR-CA-139: boleta de S/ 45,50 sin adquirente → CLIENTES VARIOS con documento 0', () => {
    const preparada = prepararEmision(boleta({ lineas: [linea('1', '45.50', 'EXONERADO')] }));
    expect(preparada.adquirente).toEqual(CLIENTES_VARIOS);
    expect(preparada.adquirente).toMatchObject({ tipoDocumento: 'DOC_0', numero: '0', nombre: 'CLIENTES VARIOS' });
  });

  it('TR-CA-140: boleta de S/ 850,00 sin adquirente (o con DOC_0) → 422 con el umbral en el texto', () => {
    const lineas = [linea('1', '850', 'EXONERADO')];
    expect(() => prepararEmision(boleta({ lineas }))).toThrow('Boletas mayores a S/ 700,00 requieren documento y nombre del adquirente');
    expect(() => prepararEmision(boleta({ lineas, adquirente: CLIENTES_VARIOS }))).toThrow(BoletaRequiereAdquirenteError);
    const conDni = { tipoDocumento: 'DNI', numero: '12345678', nombre: 'PERSONA', correo: null, personaId: null };
    expect(prepararEmision(boleta({ lineas, adquirente: conDni })).adquirente).toEqual(conDni);
    expect(() => prepararEmision(boleta({ lineas, umbralBoleta: monto('500', 'u') }))).toThrow('Boletas mayores a S/ 500,00');
  });

  it('TR-CA-141: boleta de exactamente S/ 700,00 sin adquirente → se emite', () => {
    expect(prepararEmision(boleta({ lineas: [linea('1', '700', 'INAFECTO')] })).totales.total.aTexto()).toBe('700.00');
  });

  it('TR-RN-017: serie de boleta en factura, de factura en boleta o sin formato → SERIE_NO_CORRESPONDE', () => {
    expect(() => prepararEmision(datos({ serie: 'B001' }))).toThrow(SerieNoCorrespondeError);
    expect(() => prepararEmision(boleta({ serie: 'F001' }))).toThrow(SerieNoCorrespondeError);
    expect(() => exigirSerieDelTipo('FACTURA', 'F01')).toThrow(SerieNoCorrespondeError);
    expect(() => exigirSerieDelTipo('BOLETA', 'BA1Z')).not.toThrow();
  });

  it('crédito sin cuotas, con cuotas que no suman o con vencimiento no posterior → CUOTAS_INVALIDAS; contado con cuotas también', () => {
    const total = monto('118', 'total');
    expect(() => exigirCuotas('CREDITO', [], total, FECHA)).toThrow(CuotasInvalidasError);
    expect(() => exigirCuotas('CREDITO', [cuota('100', '2026-12-24')], total, FECHA)).toThrow('Las cuotas suman 100.00 y el total es 118.00');
    expect(() => exigirCuotas('CREDITO', [cuota('118', FECHA)], total, FECHA)).toThrow(/después de la fecha de emisión/);
    expect(() => exigirCuotas('CONTADO', [cuota('118', '2026-12-24')], total, FECHA)).toThrow(CuotasInvalidasError);
    expect(() => exigirCuotas('CREDITO', [cuota('59', '2026-12-24'), cuota('59', '2027-01-24', 2)], total, FECHA)).not.toThrow();
    expect(() => prepararEmision(datos({ formaPago: 'CREDITO' }))).toThrow(CuotasInvalidasError);
  });

  it('sin líneas → DATOS_COMPROBANTE_INVALIDOS', () => {
    expect(() => prepararEmision(datos({ lineas: [] }))).toThrow(DatosComprobanteInvalidosError);
  });

  it('TR-RN-019: estado distinto de ACTIVO y condición NO HABIDO advierten; padrón sin datos no', () => {
    expect(advertenciasDelPadron(null)).toEqual([]);
    expect(advertenciasDelPadron({ estado: 'ACTIVO', condicion: 'HABIDO' })).toEqual([]);
    expect(advertenciasDelPadron({ estado: 'BAJA DE OFICIO', condicion: 'NO HABIDO' }).map((advertencia) => advertencia.codigo)).toEqual([
      'RUC_NO_ACTIVO',
      'RUC_NO_HABIDO',
    ]);
  });

  it('el emisor emite en VERIFICADO o PRODUCCION; en BORRADOR o CONFIGURADO → EMISOR_NO_HABILITADO', () => {
    const creado = Emisor.crear({ id: 'e', tenantId: 't', empresaId: 'e', creadoPor: 'u', ahora: new Date() });
    for (const estado of ['BORRADOR', 'CONFIGURADO'] as const) {
      expect(() => Emisor.reconstituir({ ...creado.datos, estado }).exigirHabilitadoParaEmitir()).toThrow(EmisorNoHabilitadoError);
    }
    expect(() => Emisor.reconstituir({ ...creado.datos, estado: 'VERIFICADO' }).exigirHabilitadoParaEmitir()).not.toThrow();
  });
});

describe('Comprobante (agregado)', () => {
  it('nace en PENDIENTE_ENVIO con su número y levanta un solo cpe.emitido sin datos del adquirente', () => {
    const comprobante = Comprobante.emitir(prepararEmision(datos()), 100);
    expect(comprobante.numeroFormateado).toBe('F001-00000100');
    expect(comprobante.datos).toMatchObject({ estado: 'PENDIENTE_ENVIO', numero: 100, version: 1 });
    const eventos = comprobante.extraerEventos();
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ eventType: EVENTOS_FE.comprobanteEmitido, aggregateId: comprobante.id, aggregateVersion: 1 });
    expect(eventos[0].payload).toEqual({
      comprobante_id: comprobante.id,
      tipo: '01',
      serie: 'F001',
      numero: 100,
      total: '118.00',
      moneda: 'PEN',
      estado: 'PENDIENTE_ENVIO',
      origen_producto: 'SAZON',
      origen_id: 'venta-1',
    });
    expect(JSON.stringify(eventos[0].payload)).not.toMatch(new RegExp(`${RUC_VALIDO}|CLIENTE`));
    expect(comprobante.extraerEventos()).toEqual([]);
  });

  it('reconoce su huella y los códigos SUNAT del tipo', () => {
    const comprobante = Comprobante.emitir(prepararEmision(datos()), 1);
    expect([comprobante.tieneLaHuella('a'.repeat(64)), comprobante.tieneLaHuella('b'.repeat(64))]).toEqual([true, false]);
    expect([tipoDesdeCodigo('01'), tipoDesdeCodigo('03')]).toEqual(['FACTURA', 'BOLETA']);
    expect(() => tipoDesdeCodigo('07')).toThrow(SerieNoCorrespondeError);
    expect(formatearNumero('B001', 7)).toBe('B001-00000007');
  });

  it('la huella no depende del orden de las propiedades y cambia con el contenido', () => {
    const una = huellaDeSolicitud({ a: 1, b: [{ c: '1.00', d: null }] });
    expect(una).toMatch(/^[0-9a-f]{64}$/);
    expect(huellaDeSolicitud({ b: [{ d: null, c: '1.00' }], a: 1 })).toBe(una);
    expect(huellaDeSolicitud({ a: 1, b: [{ c: '1.01', d: null }] })).not.toBe(una);
  });
});
