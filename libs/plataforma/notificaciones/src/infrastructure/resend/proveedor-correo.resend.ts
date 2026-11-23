import type { ErrorResponse, Resend } from 'resend';
import { ErrorDefinitivoProveedor, ErrorTemporalProveedor, type CorreoSaliente, type ProveedorCorreo } from '../../application/ports/proveedor-correo.js';
import type { CircuitBreaker } from './circuit-breaker.js';

export const TIMEOUT_ENVIO_MS = 10_000;
const CODIGO_CIRCUITO_ABIERTO = 'CIRCUITO_ABIERTO';
const CODIGO_SIN_RESPUESTA = 'SIN_RESPUESTA';
const PRIMER_ESTADO_DEL_SERVIDOR = 500;
const DEMASIADAS_SOLICITUDES = 429;
/** Resend responde 409 a dos solicitudes simultáneas con la misma Idempotency-Key: la segunda se reintenta. */
const SOLICITUDES_IDEMPOTENTES_SIMULTANEAS = 'concurrent_idempotent_requests';

/** Lo único que usa del SDK; las pruebas lo doblan. */
export type EnvioResend = Pick<Resend['emails'], 'send'>;

/**
 * Envío por el SDK oficial `resend`. `Idempotency-Key` = id del mensaje. El SDK no lanza: devuelve `error` con
 * `statusCode` nulo ante timeout o red. Temporal: sin respuesta, 5xx, 429 y circuito abierto; el resto es
 * definitivo y no cuenta como fallo del proveedor en el circuito.
 */
export class ProveedorCorreoResend implements ProveedorCorreo {
  constructor(
    private readonly emails: EnvioResend,
    private readonly circuito: CircuitBreaker,
    private readonly timeoutMs = TIMEOUT_ENVIO_MS,
  ) {}

  async enviar(correo: CorreoSaliente): Promise<{ idExterno: string }> {
    if (!this.circuito.permiteLlamada()) throw new ErrorTemporalProveedor(CODIGO_CIRCUITO_ABIERTO);
    const respuesta = await this.llamar(correo);
    if (respuesta.data) {
      this.circuito.registrarExito();
      return { idExterno: respuesta.data.id };
    }
    const error = respuesta.error ?? sinRespuesta();
    if (!esTemporal(error)) throw new ErrorDefinitivoProveedor(error.name);
    this.circuito.registrarFallo();
    throw new ErrorTemporalProveedor(error.name);
  }

  private async llamar(correo: CorreoSaliente) {
    try {
      return await this.emails.send(
        { from: correo.remitente, to: [correo.destino], subject: correo.asunto, html: correo.html },
        { idempotencyKey: correo.mensajeId, signal: AbortSignal.timeout(this.timeoutMs) },
      );
    } catch {
      return { data: null, error: sinRespuesta() };
    }
  }
}

function sinRespuesta(): ErrorResponse {
  return { name: 'application_error', statusCode: null, message: CODIGO_SIN_RESPUESTA };
}

function esTemporal(error: ErrorResponse): boolean {
  const { statusCode } = error;
  if (statusCode === null || statusCode === undefined) return true;
  if (error.name === SOLICITUDES_IDEMPOTENTES_SIMULTANEAS) return true;
  return statusCode >= PRIMER_ESTADO_DEL_SERVIDOR || statusCode === DEMASIADAS_SOLICITUDES;
}
