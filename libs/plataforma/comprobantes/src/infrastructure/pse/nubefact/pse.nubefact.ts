import type { CredencialesPse, PseOsePort } from '../../../application/ports/pse-ose.port.js';
import type { DocumentoElectronico } from '../../../domain/documento-electronico.js';
import type { RespuestaPse } from '../../../domain/respuesta-pse.js';
import type { CircuitBreaker } from '../circuit-breaker.js';
import {
  comprobanteNubefact,
  respuestaDesdeErrorNubefact,
  respuestaDesdeNubefact,
  type ErrorNubefact,
  type RespuestaNubefact,
} from './mapeo-nubefact.js';

export const TIMEOUT_NUBEFACT_MS = 15_000;
const DEMASIADAS_SOLICITUDES = 429;
const PRIMER_ERROR_DE_SERVIDOR = 500;
const CONTENIDO_JSON = 'application/json';

/** Códigos propios del adaptador cuando no hay respuesta de Nubefact; ninguno lleva la URL ni el token. */
export const CODIGOS_ADAPTADOR_NUBEFACT = {
  sinUrl: 'SIN_URL',
  circuitoAbierto: 'CIRCUITO_ABIERTO',
  tiempoAgotado: 'TIEMPO_AGOTADO',
  red: 'RED',
  respuestaInvalida: 'RESPUESTA_INVALIDA',
} as const;

/** Lo único que usa de `fetch`; las pruebas lo doblan con respuestas grabadas. */
export type Buscar = (url: string, opciones: RequestInit) => Promise<Pick<Response, 'status' | 'ok' | 'json'>>;

function errorTecnico(codigo: string, descripcion: string | null = null): RespuestaPse {
  return { resultado: 'ERROR_TECNICO', codigo, descripcion, observaciones: [] };
}

function esFallaDelServidor(estado: number): boolean {
  return estado === DEMASIADAS_SOLICITUDES || estado >= PRIMER_ERROR_DE_SERVIDOR;
}

function esTiempoAgotado(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/**
 * Nubefact por HTTP: POST a la ruta del emisor con el token en `Authorization` (manual JSON de Nubefact). Timeout de
 * 15 s y circuit breaker local; sin seguir redirecciones, así nunca llama a un host distinto de la ruta validada.
 * No registra la petición ni la respuesta.
 */
export class PseNubefact implements PseOsePort {
  constructor(
    private readonly circuito: CircuitBreaker,
    private readonly buscar: Buscar = fetch,
  ) {}

  async enviarComprobante(credenciales: CredencialesPse, documento: DocumentoElectronico): Promise<RespuestaPse> {
    if (credenciales.url === null) return { resultado: 'RECHAZADO', codigo: CODIGOS_ADAPTADOR_NUBEFACT.sinUrl, descripcion: null, observaciones: [] };
    if (!this.circuito.permiteLlamada()) return errorTecnico(CODIGOS_ADAPTADOR_NUBEFACT.circuitoAbierto);
    try {
      const respuesta = await this.buscar(credenciales.url, {
        method: 'POST',
        headers: { Authorization: credenciales.token, 'Content-Type': CONTENIDO_JSON },
        body: JSON.stringify(comprobanteNubefact(documento)),
        signal: AbortSignal.timeout(TIMEOUT_NUBEFACT_MS),
        redirect: 'error',
      });
      return await this.interpretar(respuesta);
    } catch (error) {
      this.circuito.registrarFallo();
      return errorTecnico(esTiempoAgotado(error) ? CODIGOS_ADAPTADOR_NUBEFACT.tiempoAgotado : CODIGOS_ADAPTADOR_NUBEFACT.red);
    }
  }

  private async interpretar(respuesta: Pick<Response, 'status' | 'ok' | 'json'>): Promise<RespuestaPse> {
    if (esFallaDelServidor(respuesta.status)) {
      this.circuito.registrarFallo();
      return errorTecnico(`HTTP_${respuesta.status}`);
    }
    this.circuito.registrarExito();
    const cuerpo = await this.leerJson(respuesta);
    if (cuerpo === null) return errorTecnico(CODIGOS_ADAPTADOR_NUBEFACT.respuestaInvalida);
    return respuesta.ok ? respuestaDesdeNubefact(cuerpo as RespuestaNubefact) : respuestaDesdeErrorNubefact(cuerpo as ErrorNubefact, respuesta.status);
  }

  private async leerJson(respuesta: Pick<Response, 'json'>): Promise<object | null> {
    try {
      const cuerpo: unknown = await respuesta.json();
      return typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : null;
    } catch {
      return null;
    }
  }
}
