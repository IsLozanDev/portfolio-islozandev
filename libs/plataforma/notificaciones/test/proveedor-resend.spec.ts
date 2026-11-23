import type { CreateEmailOptions, CreateEmailRequestOptions, CreateEmailResponse } from 'resend';
import { ErrorDefinitivoProveedor, ErrorTemporalProveedor } from '../src/application/ports/proveedor-correo.js';
import { ColaEnviosBullmq, INTENTOS_ENVIO } from '../src/infrastructure/bullmq/cola-envios.js';
import { APERTURA_MS, CircuitBreaker, UMBRAL_FALLOS } from '../src/infrastructure/resend/circuit-breaker.js';
import { ProveedorCorreoResend, type EnvioResend } from '../src/infrastructure/resend/proveedor-correo.resend.js';
import { RelojFijo } from './support/dobles.js';

const CORREO = { mensajeId: '42000000-0000-7000-8000-0000000000a1', remitente: 'Vitrina <a@vitrina.pe>', destino: 'ana@ejemplo.pe', asunto: 'Hola', html: '<p>Hola</p>' };

type Respuesta = CreateEmailResponse | Error | 'colgado';

/** Doble del SDK: guarda cada llamada y responde lo programado. */
class EmailsFalsos implements EnvioResend {
  readonly llamadas: { carga: CreateEmailOptions; opciones?: CreateEmailRequestOptions }[] = [];
  respuestas: Respuesta[] = [];

  async send(carga: CreateEmailOptions, opciones?: CreateEmailRequestOptions): Promise<CreateEmailResponse> {
    this.llamadas.push({ carga, opciones });
    const respuesta = this.respuestas.shift() ?? exito('re_1');
    if (respuesta === 'colgado') return colgarHastaAbortar(opciones?.signal);
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  }
}

const exito = (id: string): CreateEmailResponse => ({ data: { id }, error: null, headers: null });
const falla = (statusCode: number | null, name: string): CreateEmailResponse =>
  ({ data: null, error: { statusCode, name, message: 'detalle del proveedor' }, headers: null }) as CreateEmailResponse;

/** Como el SDK: al abortar la señal no lanza, devuelve un error sin statusCode. */
function colgarHastaAbortar(senal: AbortSignal | undefined): Promise<CreateEmailResponse> {
  return new Promise((resolver) => senal?.addEventListener('abort', () => resolver(falla(null, 'application_error'))));
}

describe('ProveedorCorreoResend', () => {
  let emails: EmailsFalsos;
  let reloj: RelojFijo;
  let proveedor: ProveedorCorreoResend;

  beforeEach(() => {
    emails = new EmailsFalsos();
    reloj = new RelojFijo();
    proveedor = new ProveedorCorreoResend(emails, new CircuitBreaker(reloj), 50);
  });

  it('envía con Idempotency-Key = mensajeId y devuelve el id externo', async () => {
    await expect(proveedor.enviar(CORREO)).resolves.toEqual({ idExterno: 're_1' });

    expect(emails.llamadas[0].carga).toEqual({ from: CORREO.remitente, to: [CORREO.destino], subject: 'Hola', html: '<p>Hola</p>' });
    expect(emails.llamadas[0].opciones).toMatchObject({ idempotencyKey: CORREO.mensajeId, signal: expect.any(AbortSignal) });
  });

  it.each([
    [falla(500, 'internal_server_error'), 'internal_server_error'],
    [falla(429, 'rate_limit_exceeded'), 'rate_limit_exceeded'],
    [falla(409, 'concurrent_idempotent_requests'), 'concurrent_idempotent_requests'],
    [falla(null, 'application_error'), 'application_error'],
  ])('temporal: %#', async (respuesta, codigo) => {
    emails.respuestas = [respuesta];

    await expect(proveedor.enviar(CORREO)).rejects.toEqual(new ErrorTemporalProveedor(codigo));
  });

  it.each([
    [falla(422, 'validation_error'), 'validation_error'],
    [falla(403, 'invalid_from_address'), 'invalid_from_address'],
    [falla(401, 'invalid_api_key'), 'invalid_api_key'],
  ])('definitivo: %#', async (respuesta, codigo) => {
    emails.respuestas = [respuesta];

    await expect(proveedor.enviar(CORREO)).rejects.toEqual(new ErrorDefinitivoProveedor(codigo));
  });

  it('el timeout aborta la llamada y es temporal; una excepción del SDK también', async () => {
    emails.respuestas = ['colgado', new Error('socket')];

    await expect(proveedor.enviar(CORREO)).rejects.toBeInstanceOf(ErrorTemporalProveedor);
    await expect(proveedor.enviar(CORREO)).rejects.toBeInstanceOf(ErrorTemporalProveedor);
  });

  it('TR-RNF-007: tras 5 temporales seguidos el circuito deja de llamar a Resend durante 30 s', async () => {
    emails.respuestas = Array.from({ length: UMBRAL_FALLOS }, () => falla(503, 'application_error'));
    for (let fallo = 0; fallo < UMBRAL_FALLOS; fallo += 1) await expect(proveedor.enviar(CORREO)).rejects.toThrow(ErrorTemporalProveedor);

    await expect(proveedor.enviar(CORREO)).rejects.toEqual(new ErrorTemporalProveedor('CIRCUITO_ABIERTO'));
    reloj.avanzar(APERTURA_MS - 1);
    await expect(proveedor.enviar(CORREO)).rejects.toEqual(new ErrorTemporalProveedor('CIRCUITO_ABIERTO'));
    expect(emails.llamadas).toHaveLength(UMBRAL_FALLOS);

    reloj.avanzar(1);
    await expect(proveedor.enviar(CORREO)).resolves.toEqual({ idExterno: 're_1' });
    expect(emails.llamadas).toHaveLength(UMBRAL_FALLOS + 1);
  });

  it('un error definitivo no abre el circuito', async () => {
    emails.respuestas = Array.from({ length: UMBRAL_FALLOS + 1 }, () => falla(422, 'validation_error'));
    for (let fallo = 0; fallo <= UMBRAL_FALLOS; fallo += 1) await expect(proveedor.enviar(CORREO)).rejects.toThrow(ErrorDefinitivoProveedor);

    await expect(proveedor.enviar(CORREO)).resolves.toEqual({ idExterno: 're_1' });
  });

  it('los errores no llevan el destino ni el mensaje del proveedor', async () => {
    emails.respuestas = [falla(422, 'validation_error')];

    const error = await proveedor.enviar(CORREO).catch((rechazo: Error) => rechazo);

    expect((error as Error).message).not.toContain('ana@ejemplo.pe');
    expect((error as Error).message).not.toContain('detalle del proveedor');
  });
});

describe('ColaEnviosBullmq', () => {
  it('jobId = mensajeId, retardo, 3 intentos con backoff exponencial desde 5 s y sin retener trabajos', async () => {
    const agregados: { nombre: string; trabajo: unknown; opciones: object }[] = [];
    const cola = new ColaEnviosBullmq({ add: async (nombre, trabajo, opciones) => agregados.push({ nombre, trabajo, opciones }) });

    await cola.encolar({ tenantId: 't', mensajeId: 'm' }, 1_000);

    expect(agregados).toEqual([
      {
        nombre: 'entregar',
        trabajo: { tenantId: 't', mensajeId: 'm' },
        opciones: {
          jobId: 'm',
          delay: 1_000,
          attempts: INTENTOS_ENVIO,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
    ]);
  });
});
