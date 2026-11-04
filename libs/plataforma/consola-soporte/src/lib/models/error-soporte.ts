import { HttpErrorResponse } from '@angular/common/http';
import { MENSAJE_ERROR_DESCONOCIDO } from './mensajes-soporte';

export const CODIGO_DESCONOCIDO = 'DESCONOCIDO';

/** Error de la API como `{ codigo, mensaje }`. `mensaje` es texto plano para mostrar. */
export class ErrorSoporte extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number | null,
    options?: { cause?: unknown },
  ) {
    super(mensaje, options);
    this.name = 'ErrorSoporte';
  }
}

interface CuerpoDeError {
  codigo?: unknown;
  mensaje?: unknown;
}

/** La API ya trae el mensaje en español (TICKET_INVALIDO, VIGENCIA_SOPORTE_EXCEDIDA, SOPORTE_AGENTE_ES_MIEMBRO…). */
export function aErrorSoporte(error: unknown): ErrorSoporte {
  if (error instanceof ErrorSoporte) return error;
  if (!(error instanceof HttpErrorResponse)) return new ErrorSoporte(CODIGO_DESCONOCIDO, MENSAJE_ERROR_DESCONOCIDO, null, { cause: error });
  const cuerpo = (error.error ?? {}) as CuerpoDeError;
  const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo : CODIGO_DESCONOCIDO;
  const mensaje = typeof cuerpo.mensaje === 'string' ? cuerpo.mensaje : MENSAJE_ERROR_DESCONOCIDO;
  return new ErrorSoporte(codigo, mensaje, error.status, { cause: error });
}
