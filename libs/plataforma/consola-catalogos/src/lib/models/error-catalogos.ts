import { HttpErrorResponse } from '@angular/common/http';
import { aFilasInvalidas, type FilasInvalidas, type FilasInvalidasRespuesta } from './importacion';
import { MENSAJE_ERROR_DESCONOCIDO, MENSAJES_POR_CODIGO } from './mensajes-catalogos';

export const CODIGO_DESCONOCIDO = 'DESCONOCIDO';
export const CODIGO_FILAS_INVALIDAS = 'FILAS_INVALIDAS';
const HTTP_ENTIDAD_NO_PROCESABLE = 422;

/** Código de la API → campo del formulario donde va el mensaje. Los demás van como alerta. */
const CAMPOS_POR_CODIGO: Readonly<Record<string, string>> = {
  CATALOGO_DUPLICADO: 'codigo',
  CODIGO_DUPLICADO: 'codigo',
};

/** Error de la API como `{ codigo, mensaje }`, con el campo del formulario al que pertenece, si lo hay. */
export class ErrorCatalogos extends Error {
  readonly campo: string | null;

  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number | null,
    options?: { cause?: unknown },
  ) {
    super(mensaje, options);
    this.name = 'ErrorCatalogos';
    this.campo = CAMPOS_POR_CODIGO[codigo] ?? null;
  }
}

/** 422 de la previsualización: el archivo tiene filas inválidas y la importación quedó RECHAZADA. */
export class ErrorFilasInvalidas extends ErrorCatalogos {
  constructor(
    mensaje: string,
    readonly filas: FilasInvalidas,
    options?: { cause?: unknown },
  ) {
    super(CODIGO_FILAS_INVALIDAS, mensaje, HTTP_ENTIDAD_NO_PROCESABLE, options);
    this.name = 'ErrorFilasInvalidas';
  }
}

interface CuerpoDeError {
  codigo?: unknown;
  mensaje?: unknown;
}

export function aErrorCatalogos(error: unknown): ErrorCatalogos {
  if (error instanceof ErrorCatalogos) return error;
  if (!(error instanceof HttpErrorResponse)) return new ErrorCatalogos(CODIGO_DESCONOCIDO, MENSAJE_ERROR_DESCONOCIDO, null, { cause: error });

  const cuerpo = (error.error ?? {}) as CuerpoDeError;
  const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo : CODIGO_DESCONOCIDO;
  const mensaje = typeof cuerpo.mensaje === 'string' ? cuerpo.mensaje : (MENSAJES_POR_CODIGO[codigo] ?? MENSAJE_ERROR_DESCONOCIDO);
  if (codigo === CODIGO_FILAS_INVALIDAS) {
    return new ErrorFilasInvalidas(mensaje, aFilasInvalidas(error.error as FilasInvalidasRespuesta), { cause: error });
  }
  return new ErrorCatalogos(codigo, mensaje, error.status, { cause: error });
}
