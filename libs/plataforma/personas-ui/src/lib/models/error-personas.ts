import { HttpErrorResponse } from '@angular/common/http';

export const CODIGO_DESCONOCIDO = 'DESCONOCIDO';
export const MENSAJE_ERROR_DESCONOCIDO = 'No se pudo completar la operación. Inténtelo de nuevo.';

/** Error de la API de personas como `{ codigo, mensaje }`, con el estado HTTP y, en PERSONA_DUPLICADA, la persona existente. */
export class ErrorPersonas extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number | null,
    readonly personaId: string | null = null,
    options?: { cause?: unknown },
  ) {
    super(mensaje, options);
    this.name = 'ErrorPersonas';
  }
}

interface CuerpoDeError {
  codigo?: unknown;
  mensaje?: unknown;
  persona_id?: unknown;
}

export function aErrorPersonas(error: unknown): ErrorPersonas {
  if (error instanceof ErrorPersonas) return error;
  if (!(error instanceof HttpErrorResponse)) {
    return new ErrorPersonas(CODIGO_DESCONOCIDO, MENSAJE_ERROR_DESCONOCIDO, null, null, { cause: error });
  }

  const cuerpo = (error.error ?? {}) as CuerpoDeError;
  const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo : CODIGO_DESCONOCIDO;
  const mensaje = typeof cuerpo.mensaje === 'string' ? cuerpo.mensaje : MENSAJE_ERROR_DESCONOCIDO;
  const personaId = typeof cuerpo.persona_id === 'string' ? cuerpo.persona_id : null;
  return new ErrorPersonas(codigo, mensaje, error.status, personaId, { cause: error });
}
