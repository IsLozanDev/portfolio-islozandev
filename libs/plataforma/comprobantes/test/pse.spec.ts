import type { Clock } from '@vitrina/plataforma/kernel';
import type { CredencialesPse } from '../src/application/ports/pse-ose.port.js';
import { boletaDePrueba } from '../src/domain/documento-electronico.js';
import { emisorDePrueba } from '../src/domain/emisor-documento.js';
import { ProveedorFeInvalidoError } from '../src/domain/errores.js';
import { ColaPruebasFeBullmq, INTENTOS_PRUEBA_FE, NOMBRE_COLA_PRUEBAS_FE } from '../src/infrastructure/bullmq/cola-pruebas.js';
import { APERTURA_MS, CircuitBreaker, UMBRAL_FALLOS } from '../src/infrastructure/pse/circuit-breaker.js';
import { comprobanteNubefact, fechaNubefact, respuestaDesdeErrorNubefact, respuestaDesdeNubefact } from '../src/infrastructure/pse/nubefact/mapeo-nubefact.js';
import { PseNubefact, TIMEOUT_NUBEFACT_MS, type Buscar } from '../src/infrastructure/pse/nubefact/pse.nubefact.js';
import { ResolutorPseMapa } from '../src/infrastructure/pse/resolutor-pse.js';
import { PseSimulador, TOKEN_SIMULAR_ERROR, TOKEN_SIMULAR_RECHAZO } from '../src/infrastructure/pse/simulador/pse.simulador.js';
import { camposEntornoFe, reglasEntornoFe } from '../src/interface/entorno-fe.js';
import { z } from 'zod';

const RUTA = 'https://api.nubefact.com/api/v1/48239908-7ae7-4353-824d-071765d4';
const TOKEN = '8d19d8c7c1f6402687720eab85cd57a54f5a7a3fa163476bbcf381ee2b5e0c69';
const credenciales: CredencialesPse = { url: RUTA, usuario: null, token: TOKEN, ambiente: 'BETA' };
const EMISOR = emisorDePrueba({ ruc: '20601234561', razonSocial: 'EMPRESA SAC', nombreComercial: null, domicilioFiscal: null, ubigeo: null });
const boleta = boletaDePrueba(EMISOR, 'B001', 3, new Date('2026-11-23T15:00:00Z'));

// Respuestas grabadas del manual JSON de Nubefact (operación 1 y «MANEJO DE ERRORES»), adaptadas a una boleta.
const ACEPTADA = {
  tipo_de_comprobante: 2,
  serie: 'B001',
  numero: 3,
  enlace: 'https://www.nubefact.com/cpe/d268f882-4554-a403c6712e6',
  enlace_del_pdf: '',
  enlace_del_xml: '',
  enlace_del_cdr: '',
  aceptada_por_sunat: true,
  sunat_description: 'La Boleta numero B001-3, ha sido aceptada',
  sunat_note: null,
  sunat_responsecode: '0',
  sunat_soap_error: '',
  cadena_para_codigo_qr: '20601234561 | 03 | B001 | 000003 | ...',
  codigo_hash: 'xMLFMnbgp1/bHEy572RKRTE9hPY=',
};
const PENDIENTE_SUNAT = { ...ACEPTADA, aceptada_por_sunat: false, sunat_description: null, sunat_responsecode: null, codigo_hash: '' };
const RECHAZADA_SUNAT = { ...ACEPTADA, aceptada_por_sunat: false, sunat_responsecode: '2017', sunat_description: 'El numero de documento debe ser RUC' };
const ERROR_FORMATO = { errors: 'El archivo enviado no cumple con el formato establecido', codigo: 20 };
const ERROR_TOKEN = { errors: 'No se pudo autenticar, token incorrecto o eliminado', codigo: 10 };
const ERROR_INTERNO = { errors: 'Error interno desconocido', codigo: 40 };

class RelojManual implements Clock {
  instante = new Date('2026-11-23T15:00:00Z');
  now(): Date {
    return new Date(this.instante);
  }
}

function respuestaHttp(status: number, cuerpo: unknown): ReturnType<Buscar> {
  return Promise.resolve({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(cuerpo) } as Awaited<ReturnType<Buscar>>);
}

describe('mapeo de Nubefact (funciones puras)', () => {
  it('la boleta de prueba va como generar_comprobante tipo 2, serie B, varios, en soles, con fecha DD-MM-AAAA', () => {
    expect(fechaNubefact('2026-11-03')).toBe('03-11-2026');
    expect(comprobanteNubefact(boleta)).toEqual({
      operacion: 'generar_comprobante',
      tipo_de_comprobante: 2,
      serie: 'B001',
      numero: 3,
      sunat_transaction: 1,
      cliente_tipo_de_documento: '-',
      cliente_numero_de_documento: '-',
      cliente_denominacion: 'CLIENTES VARIOS',
      cliente_direccion: '',
      fecha_de_emision: '23-11-2026',
      moneda: 1,
      porcentaje_de_igv: 18,
      total_gravada: 0.85,
      total_igv: 0.15,
      total: 1,
      enviar_automaticamente_a_la_sunat: true,
      enviar_automaticamente_al_cliente: false,
      items: [
        {
          unidad_de_medida: 'ZZ',
          descripcion: 'PRUEBA DE CONEXION CON EL PSE',
          cantidad: 1,
          valor_unitario: 0.85,
          precio_unitario: 1,
          subtotal: 0.85,
          tipo_de_igv: 1,
          igv: 0.15,
          total: 1,
          anticipo_regularizacion: false,
        },
      ],
    });
  });

  it('aceptada por SUNAT → ACEPTADO con hash y enlaces no vacíos; con nota → ACEPTADO_CON_OBSERVACIONES', () => {
    expect(respuestaDesdeNubefact(ACEPTADA)).toEqual({
      resultado: 'ACEPTADO',
      codigo: '0',
      descripcion: 'La Boleta numero B001-3, ha sido aceptada',
      observaciones: [],
      hash: 'xMLFMnbgp1/bHEy572RKRTE9hPY=',
      enlaces: { comprobante: ACEPTADA.enlace },
    });
    expect(respuestaDesdeNubefact({ ...ACEPTADA, sunat_note: 'Observación 4252' })).toMatchObject({
      resultado: 'ACEPTADO_CON_OBSERVACIONES',
      observaciones: ['Observación 4252'],
    });
  });

  it('código SUNAT distinto de 0 → RECHAZADO; sin respuesta de SUNAT → EN_PROCESO', () => {
    expect(respuestaDesdeNubefact(RECHAZADA_SUNAT)).toMatchObject({ resultado: 'RECHAZADO', codigo: '2017' });
    expect(respuestaDesdeNubefact(PENDIENTE_SUNAT)).toMatchObject({ resultado: 'EN_PROCESO', codigo: null, hash: undefined });
  });

  it('errores { errors, codigo }: validación o token → RECHAZADO con su código; 40 → ERROR_TECNICO; sin código → HTTP_xxx', () => {
    expect(respuestaDesdeErrorNubefact(ERROR_FORMATO, 400)).toMatchObject({ resultado: 'RECHAZADO', codigo: '20', descripcion: ERROR_FORMATO.errors });
    expect(respuestaDesdeErrorNubefact(ERROR_TOKEN, 401)).toMatchObject({ resultado: 'RECHAZADO', codigo: '10' });
    expect(respuestaDesdeErrorNubefact(ERROR_INTERNO, 400)).toMatchObject({ resultado: 'ERROR_TECNICO', codigo: '40' });
    expect(respuestaDesdeErrorNubefact({}, 400)).toMatchObject({ resultado: 'RECHAZADO', codigo: 'HTTP_400' });
  });
});

describe('PseNubefact (HTTP con respuestas grabadas)', () => {
  let reloj: RelojManual;
  let llamadas: { url: string; opciones: RequestInit }[];
  let siguiente: () => ReturnType<Buscar>;
  let adaptador: PseNubefact;

  beforeEach(() => {
    reloj = new RelojManual();
    llamadas = [];
    siguiente = () => respuestaHttp(200, ACEPTADA);
    adaptador = new PseNubefact(new CircuitBreaker(reloj), (url, opciones) => {
      llamadas.push({ url, opciones });
      return siguiente();
    });
  });

  it('POST a la ruta con el token en Authorization, JSON, timeout de 15 s y sin seguir redirecciones', async () => {
    expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'ACEPTADO' });
    const [{ url, opciones }] = llamadas;
    expect(url).toBe(RUTA);
    expect(opciones).toMatchObject({ method: 'POST', headers: { Authorization: TOKEN, 'Content-Type': 'application/json' }, redirect: 'error' });
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(opciones.body))).toMatchObject({ operacion: 'generar_comprobante', serie: 'B001', numero: 3 });
    expect(TIMEOUT_NUBEFACT_MS).toBe(15_000);
  });

  it('400 de validación → RECHAZADO; 500, 503 y 429 → ERROR_TECNICO; JSON inválido → ERROR_TECNICO', async () => {
    siguiente = () => respuestaHttp(400, ERROR_FORMATO);
    expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'RECHAZADO', codigo: '20' });
    for (const estado of [500, 503, 429]) {
      siguiente = () => respuestaHttp(estado, {});
      expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'ERROR_TECNICO', codigo: `HTTP_${estado}` });
    }
    siguiente = () => Promise.resolve({ status: 200, ok: true, json: () => Promise.reject(new SyntaxError('x')) } as Awaited<ReturnType<Buscar>>);
    expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'ERROR_TECNICO', codigo: 'RESPUESTA_INVALIDA' });
  });

  it('timeout y red caída → ERROR_TECNICO sin la URL ni el token en la respuesta', async () => {
    siguiente = () => Promise.reject(new DOMException('tiempo', 'TimeoutError'));
    const porTiempo = await adaptador.enviarComprobante(credenciales, boleta);
    expect(porTiempo).toMatchObject({ resultado: 'ERROR_TECNICO', codigo: 'TIEMPO_AGOTADO' });
    siguiente = () => Promise.reject(new TypeError(`fetch failed ${RUTA}`));
    const porRed = await adaptador.enviarComprobante(credenciales, boleta);
    expect(porRed).toMatchObject({ resultado: 'ERROR_TECNICO', codigo: 'RED' });
    expect(JSON.stringify([porTiempo, porRed])).not.toMatch(new RegExp(`${TOKEN}|nubefact`));
  });

  it(`circuito: ${UMBRAL_FALLOS} fallos seguidos lo abren y no llama; a los ${APERTURA_MS / 1000} s prueba otra vez`, async () => {
    siguiente = () => respuestaHttp(503, {});
    for (let fallo = 0; fallo < UMBRAL_FALLOS; fallo += 1) await adaptador.enviarComprobante(credenciales, boleta);
    expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'ERROR_TECNICO', codigo: 'CIRCUITO_ABIERTO' });
    expect(llamadas).toHaveLength(UMBRAL_FALLOS);

    reloj.instante = new Date(reloj.instante.getTime() + APERTURA_MS);
    siguiente = () => respuestaHttp(200, ACEPTADA);
    expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'ACEPTADO' });
  });

  it('sin ruta no llama y lo da por rechazado', async () => {
    expect(await adaptador.enviarComprobante({ ...credenciales, url: null }, boleta)).toMatchObject({ resultado: 'RECHAZADO', codigo: 'SIN_URL' });
    expect(llamadas).toHaveLength(0);
  });
});

describe('PseSimulador, ResolutorPseMapa y la cola fe-pruebas', () => {
  it('el simulador es determinista según el token', async () => {
    const simulador = new PseSimulador();
    expect(await simulador.enviarComprobante({ ...credenciales, token: TOKEN_SIMULAR_RECHAZO }, boleta)).toMatchObject({ resultado: 'RECHAZADO', codigo: '2800' });
    expect(await simulador.enviarComprobante({ ...credenciales, token: TOKEN_SIMULAR_ERROR }, boleta)).toMatchObject({ resultado: 'ERROR_TECNICO' });
    const aceptada = await simulador.enviarComprobante(credenciales, boleta);
    expect(aceptada).toMatchObject({ resultado: 'ACEPTADO', codigo: '0', hash: expect.any(String) });
    expect(await simulador.enviarComprobante(credenciales, boleta)).toEqual(aceptada);
  });

  it('el resolutor elige por código y, sin adaptador, PROVEEDOR_FE_INVALIDO', () => {
    const simulador = new PseSimulador();
    const resolutor = new ResolutorPseMapa({ SIMULADO: simulador });
    expect(resolutor.para('SIMULADO')).toBe(simulador);
    expect(() => resolutor.para('NUBEFACT')).toThrow(ProveedorFeInvalidoError);
  });

  it('encola con jobId emisorId-numeroPrueba, 3 intentos y backoff exponencial desde 5 s', async () => {
    const agregados: { nombre: string; trabajo: unknown; opciones: object }[] = [];
    const cola = new ColaPruebasFeBullmq({ add: async (nombre, trabajo, opciones) => void agregados.push({ nombre, trabajo, opciones }) });
    const trabajo = { tenantId: 't', emisorId: 'e', numeroPrueba: 4 };
    await cola.encolar(trabajo);
    expect(NOMBRE_COLA_PRUEBAS_FE).toBe('fe-pruebas');
    expect(agregados).toEqual([
      {
        nombre: 'probar',
        trabajo,
        opciones: { jobId: 'e-4', attempts: INTENTOS_PRUEBA_FE, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: true, removeOnFail: true },
      },
    ]);
    expect(INTENTOS_PRUEBA_FE).toBe(3);
  });
});

describe('entorno de FE', () => {
  const esquema = z.object(camposEntornoFe);

  it('por defecto (o vacío) nada está permitido; con true sí', () => {
    expect(reglasEntornoFe(esquema.parse({}))).toEqual({ produccionPermitida: false, simuladoPermitido: false });
    expect(reglasEntornoFe(esquema.parse({ FE_PRODUCCION_PERMITIDA: '', FE_SIMULADO_PERMITIDO: 'true' }))).toEqual({
      produccionPermitida: false,
      simuladoPermitido: true,
    });
    expect(esquema.safeParse({ FE_SIMULADO_PERMITIDO: 'si' }).success).toBe(false);
  });
});
