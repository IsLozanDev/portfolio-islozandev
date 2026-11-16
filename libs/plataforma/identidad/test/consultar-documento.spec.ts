import type { DatosDni } from '../src/domain/datos-identidad.js';
import { ConsultarDocumento } from '../src/application/consultar-documento.js';
import type { ProveedorIdentidad } from '../src/application/ports/proveedores.js';
import { ServicioIdentidad } from '../src/application/servicio-identidad.js';
import { crearEntradaCache } from '../src/domain/entrada-cache.js';
import {
  DocumentoInvalidoError,
  DocumentoNoEncontradoError,
  ProveedorNoDisponibleError,
  TipoNoConsultableError,
} from '../src/domain/errores.js';
import { ProveedorFalso } from '../src/infrastructure/falso/proveedor.falso.js';
import { DECOLECTA, HasherPrueba, TENANT_A, TENANT_B, USUARIO, crearDobles } from './support/dobles.js';

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;
const DNI_JUANA = '45781236';
const JUANA: DatosDni = { nombres: 'Juana', apellidos: 'Quispe Mamani' };
const RESPALDO = { codigo: 'RESPALDO', prioridad: 2, ttlDias: 15, timeoutMs: 3000 };

const consulta = (tipo: 'DNI' | 'RUC' | 'CE' | 'PAS', numero: string) => ({ tipo, numero, motivo: 'REGISTRO_CLIENTE' as const });

describe('ConsultarDocumento', () => {
  it('TR-CA-115: la caché de otro tenant de hace 10 días responde sin proveedor ni cuota', async () => {
    const dobles = crearDobles();
    const hace10Dias = new Date(dobles.reloj.now().getTime() - 10 * MILISEGUNDOS_POR_DIA);
    await dobles.cache.guardar(
      crearEntradaCache({ documento: { tipo: 'DNI', datos: JUANA }, numero: DNI_JUANA, fuente: 'DECOLECTA', consultadoEn: hace10Dias, ttlDias: 30 }),
    );
    dobles.contexto.alcance = { tenantId: TENANT_B };

    const respuesta = await new ConsultarDocumento(dobles.dependencias).ejecutar(consulta('DNI', DNI_JUANA));

    expect(respuesta).toEqual({ tipo: 'DNI', datos: JUANA, fuente: 'CACHE', proveedor: 'DECOLECTA', consultadoEn: hace10Dias });
    expect(dobles.consultor.llamadas).toBe(0);
    expect(dobles.cuota.reservas).toBe(0);
    expect(dobles.bitacora.registros).toEqual([expect.objectContaining({ tenantId: TENANT_B, resultado: 'CACHE', proveedor: 'DECOLECTA' })]);
  });

  it('TR-CA-116: si el de prioridad 1 no responde a tiempo, responde el de prioridad 2 y queda en la bitácora', async () => {
    const lento = new ProveedorFalso({ codigo: 'DECOLECTA', demoraMs: 1000 });
    const dobles = crearDobles([lento, new ProveedorFalso({ codigo: 'RESPALDO' })], [{ ...DECOLECTA, timeoutMs: 100 }, RESPALDO]);

    const respuesta = await new ConsultarDocumento(dobles.dependencias).ejecutar(consulta('DNI', DNI_JUANA));

    expect(respuesta).toMatchObject({ fuente: 'PROVEEDOR', proveedor: 'RESPALDO', datos: JUANA });
    expect(dobles.bitacora.registros).toEqual([expect.objectContaining({ resultado: 'PROVEEDOR', proveedor: 'RESPALDO' })]);
    expect(dobles.cache.entradas.get(`DNI:${DNI_JUANA}`)?.expiraEn).toEqual(
      new Date(dobles.reloj.now().getTime() + RESPALDO.ttlDias * MILISEGUNDOS_POR_DIA),
    );
  });

  it('TR-CA-117: si el proveedor devuelve dirección, la caché guarda solo nombres y apellidos', async () => {
    const indiscreto: ProveedorIdentidad = {
      codigo: 'DECOLECTA',
      consultarDni: async () => ({ ...JUANA, direccion: 'Jr. Lima 1' }) as DatosDni,
      consultarRuc: async () => null,
    };
    const dobles = crearDobles([indiscreto]);

    const respuesta = await new ConsultarDocumento(dobles.dependencias).ejecutar(consulta('DNI', DNI_JUANA));

    expect(dobles.cache.entradas.get(`DNI:${DNI_JUANA}`)?.datos).toEqual(JUANA);
    expect(respuesta.datos).toEqual(JUANA);
  });

  it('TR-CA-118: RUC ACTIVO y HABIDO es apto para factura', async () => {
    const dobles = crearDobles();
    const respuesta = await new ConsultarDocumento(dobles.dependencias).ejecutar(consulta('RUC', '20512345671'));
    expect(respuesta).toMatchObject({ tipo: 'RUC', aptoFactura: true, datos: { razonSocial: 'Comercial Andina S.A.C.' } });
    expect(respuesta).not.toHaveProperty('motivoNoApto');
  });

  it('TR-CA-119: RUC en BAJA DE OFICIO no es apto', async () => {
    const dobles = crearDobles();
    const respuesta = await new ConsultarDocumento(dobles.dependencias).ejecutar(consulta('RUC', '20498765433'));
    expect(respuesta).toMatchObject({ aptoFactura: false, motivoNoApto: 'Estado BAJA DE OFICIO' });
  });

  it('si fallan todos los proveedores: 503, libera la cuota y registra PROVEEDOR_NO_DISPONIBLE', async () => {
    const dobles = crearDobles(
      [new ProveedorFalso({ codigo: 'DECOLECTA', falla: true }), new ProveedorFalso({ codigo: 'RESPALDO', falla: true })],
      [DECOLECTA, RESPALDO],
    );

    await expect(new ConsultarDocumento(dobles.dependencias).ejecutar(consulta('DNI', DNI_JUANA))).rejects.toThrow(
      ProveedorNoDisponibleError,
    );
    expect(dobles.cuota.reservas).toBe(1);
    expect(dobles.cuota.liberaciones).toBe(1);
    expect(dobles.bitacora.registros).toEqual([expect.objectContaining({ resultado: 'PROVEEDOR_NO_DISPONIBLE', proveedor: null })]);
    expect(dobles.cache.entradas.size).toBe(0);
  });

  it('con la caché vencida vuelve al proveedor y actualiza la caché', async () => {
    const dobles = crearDobles();
    const hace40Dias = new Date(dobles.reloj.now().getTime() - 40 * MILISEGUNDOS_POR_DIA);
    await dobles.cache.guardar(
      crearEntradaCache({
        documento: { tipo: 'DNI', datos: { nombres: 'Juana', apellidos: 'Quispe' } },
        numero: DNI_JUANA,
        fuente: 'DECOLECTA',
        consultadoEn: hace40Dias,
        ttlDias: 30,
      }),
    );

    const respuesta = await new ConsultarDocumento(dobles.dependencias).ejecutar(consulta('DNI', DNI_JUANA));

    expect(respuesta).toMatchObject({ fuente: 'PROVEEDOR', datos: JUANA, consultadoEn: dobles.reloj.now() });
    expect(dobles.consultor.llamadas).toBe(1);
    expect(dobles.cache.entradas.get(`DNI:${DNI_JUANA}`)).toMatchObject({ datos: JUANA, consultadoEn: dobles.reloj.now() });
  });

  it('NO_ENCONTRADO: 404, bitácora NO_ENCONTRADO y nada en caché', async () => {
    const dobles = crearDobles();

    await expect(new ConsultarDocumento(dobles.dependencias).ejecutar(consulta('DNI', '99999999'))).rejects.toThrow(
      DocumentoNoEncontradoError,
    );
    expect(dobles.bitacora.registros).toEqual([expect.objectContaining({ resultado: 'NO_ENCONTRADO', proveedor: 'DECOLECTA' })]);
    expect(dobles.cache.entradas.size).toBe(0);
    expect(dobles.cuota.liberaciones).toBe(0);
  });

  it('documento inválido: 422 con motivo y bitácora INVALIDO, sin proveedor', async () => {
    const dobles = crearDobles();

    await expect(new ConsultarDocumento(dobles.dependencias).ejecutar(consulta('RUC', '30601234567'))).rejects.toMatchObject({
      constructor: DocumentoInvalidoError,
      motivo: 'PREFIJO',
    });
    expect(dobles.bitacora.registros).toEqual([expect.objectContaining({ tipo: 'RUC', resultado: 'INVALIDO', proveedor: null })]);
    expect(dobles.consultor.llamadas).toBe(0);
  });

  it.each(['CE', 'PAS'] as const)('%s no se consulta y no deja bitácora', async (tipo) => {
    const dobles = crearDobles();
    await expect(new ConsultarDocumento(dobles.dependencias).ejecutar(consulta(tipo, '001234567'))).rejects.toThrow(
      TipoNoConsultableError,
    );
    expect(dobles.bitacora.registros).toEqual([]);
  });

  it('sin cuota: bitácora CUOTA_AGOTADA y 503 sin llamar al proveedor', async () => {
    const dobles = crearDobles();
    dobles.cuota.disponible = false;

    await expect(new ConsultarDocumento(dobles.dependencias).ejecutar(consulta('DNI', DNI_JUANA))).rejects.toThrow(
      ProveedorNoDisponibleError,
    );
    expect(dobles.bitacora.registros).toEqual([expect.objectContaining({ resultado: 'CUOTA_AGOTADA' })]);
    expect(dobles.consultor.llamadas).toBe(0);
  });

  it('la bitácora lleva el hash del número, el usuario, el producto y el motivo; nunca el número en claro', async () => {
    const dobles = crearDobles();
    await new ConsultarDocumento(dobles.dependencias).ejecutar({ ...consulta('DNI', DNI_JUANA), productoCodigo: 'POS' });

    const [registro] = dobles.bitacora.registros;
    expect(registro).toEqual({
      tenantId: TENANT_A,
      usuarioId: USUARIO,
      productoCodigo: 'POS',
      tipo: 'DNI',
      numeroHash: new HasherPrueba().hashear(DNI_JUANA),
      motivo: 'REGISTRO_CLIENTE',
      resultado: 'PROVEEDOR',
      proveedor: 'DECOLECTA',
      consultadoEn: dobles.reloj.now(),
    });
    expect(registro.numeroHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(dobles.bitacora.registros)).not.toContain(DNI_JUANA);
  });

  it('sin actor ni producto los deja en null', async () => {
    const dobles = crearDobles();
    dobles.contexto.alcance = { tenantId: TENANT_A };
    await new ConsultarDocumento(dobles.dependencias).ejecutar(consulta('DNI', DNI_JUANA));
    expect(dobles.bitacora.registros[0]).toMatchObject({ usuarioId: null, productoCodigo: null });
  });
});

describe('ServicioIdentidad (IdentidadPort)', () => {
  it('valida sin tocar nada y consulta con el caso de uso', async () => {
    const dobles = crearDobles();
    const servicio = new ServicioIdentidad(new ConsultarDocumento(dobles.dependencias));

    expect(servicio.validar('DNI', '4578123A')).toEqual({ valido: false, motivo: 'CARACTERES' });
    expect(dobles.bitacora.registros).toEqual([]);
    await expect(servicio.consultar({ tipo: 'DNI', numero: DNI_JUANA, motivo: 'REGISTRO_CLIENTE' })).resolves.toMatchObject({ datos: JUANA });
  });
});
