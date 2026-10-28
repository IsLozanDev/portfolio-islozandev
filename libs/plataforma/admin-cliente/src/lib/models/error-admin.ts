import { HttpErrorResponse } from '@angular/common/http';
import { MENSAJE_ERROR_DESCONOCIDO, MENSAJES_POR_CODIGO } from './mensajes-admin';

export const CODIGO_DESCONOCIDO = 'DESCONOCIDO';

/** Error de la API como `{ codigo, mensaje }`. `mensaje` es texto plano para mostrar. */
export class ErrorAdmin extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number | null,
    options?: { cause?: unknown },
  ) {
    super(mensaje, options);
    this.name = 'ErrorAdmin';
  }
}

interface CuerpoDeError {
  codigo?: unknown;
  mensaje?: unknown;
}

export function aErrorAdmin(error: unknown): ErrorAdmin {
  if (error instanceof ErrorAdmin) return error;
  if (!(error instanceof HttpErrorResponse)) return new ErrorAdmin(CODIGO_DESCONOCIDO, MENSAJE_ERROR_DESCONOCIDO, null, { cause: error });

  const cuerpo = (error.error ?? {}) as CuerpoDeError;
  const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo : CODIGO_DESCONOCIDO;
  const mensaje = typeof cuerpo.mensaje === 'string' ? cuerpo.mensaje : (MENSAJES_POR_CODIGO[codigo] ?? MENSAJE_ERROR_DESCONOCIDO);
  return new ErrorAdmin(codigo, mensaje, error.status, { cause: error });
}
