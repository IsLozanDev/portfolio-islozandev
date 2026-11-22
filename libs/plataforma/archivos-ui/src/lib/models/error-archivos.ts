import { HttpErrorResponse } from '@angular/common/http';

export const CODIGO_DESCONOCIDO = 'DESCONOCIDO';
export const MENSAJE_ERROR_DESCONOCIDO = 'No se pudo completar la operación. Inténtelo de nuevo.';

/** Error de la API de archivos como `{ codigo, mensaje }`, con el estado HTTP si lo hubo. */
export class ErrorArchivos extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number | null,
    options?: { cause?: unknown },
  ) {
    super(mensaje, options);
    this.name = 'ErrorArchivos';
  }
}

interface CuerpoDeError {
  codigo?: unknown;
  mensaje?: unknown;
}

export function aErrorArchivos(error: unknown): ErrorArchivos {
  if (error instanceof ErrorArchivos) return error;
  if (!(error instanceof HttpErrorResponse)) return new ErrorArchivos(CODIGO_DESCONOCIDO, MENSAJE_ERROR_DESCONOCIDO, null, { cause: error });

  const cuerpo = (error.error ?? {}) as CuerpoDeError;
  const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo : CODIGO_DESCONOCIDO;
  const mensaje = typeof cuerpo.mensaje === 'string' ? cuerpo.mensaje : MENSAJE_ERROR_DESCONOCIDO;
  return new ErrorArchivos(codigo, mensaje, error.status, { cause: error });
}
