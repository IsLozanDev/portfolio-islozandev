import { HttpErrorResponse } from '@angular/common/http';
import { MENSAJE_ERROR_DESCONOCIDO, MENSAJES_POR_CODIGO } from './mensajes-identidad';

export const CODIGO_DESCONOCIDO = 'DESCONOCIDO';
/** 409 del bloqueo optimista: los paneles avisan y recargan sin cerrarse. */
export const CODIGO_VERSION_OBSOLETA = 'VERSION_OBSOLETA';
/** 403 de las pantallas de consola abiertas desde un tenant cliente: se muestra como estado vacío. */
export const CODIGO_OPERADOR_REQUERIDO = 'OPERADOR_REQUERIDO';

/** Error de la API como `{ codigo, mensaje }`; el mensaje propio de la pantalla gana al de la API. */
export class ErrorIdentidad extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number | null,
    options?: { cause?: unknown },
  ) {
    super(mensaje, options);
    this.name = 'ErrorIdentidad';
  }
}

interface CuerpoDeError {
  codigo?: unknown;
  mensaje?: unknown;
}

export function aErrorIdentidad(error: unknown): ErrorIdentidad {
  if (error instanceof ErrorIdentidad) return error;
  if (!(error instanceof HttpErrorResponse)) return new ErrorIdentidad(CODIGO_DESCONOCIDO, MENSAJE_ERROR_DESCONOCIDO, null, { cause: error });

  const cuerpo = (error.error ?? {}) as CuerpoDeError;
  const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo : CODIGO_DESCONOCIDO;
  const mensajeApi = typeof cuerpo.mensaje === 'string' ? cuerpo.mensaje : MENSAJE_ERROR_DESCONOCIDO;
  return new ErrorIdentidad(codigo, MENSAJES_POR_CODIGO[codigo] ?? mensajeApi, error.status, { cause: error });
}
