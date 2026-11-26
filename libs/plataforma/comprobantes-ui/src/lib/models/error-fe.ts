import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { CODIGOS_ERROR_FE, mensajeErrorFe } from './mensajes-emisor';

export const CODIGO_DESCONOCIDO_FE = 'DESCONOCIDO';

/** Error de /v1/fe con el código de la API y el texto en español de `MENSAJES_ERROR_FE`. */
export class ErrorFe extends Error {
  constructor(
    readonly codigo: string,
    readonly estado: number | null,
    options?: { cause?: unknown },
  ) {
    super(mensajeErrorFe(codigo), options);
    this.name = 'ErrorFe';
  }
}

interface CuerpoDeError {
  codigo?: unknown;
}

function codigoDe(error: HttpErrorResponse): string {
  if (error.status === HttpStatusCode.PayloadTooLarge) return CODIGOS_ERROR_FE.archivoDemasiadoGrande;
  const cuerpo = (error.error ?? {}) as CuerpoDeError;
  return typeof cuerpo.codigo === 'string' ? cuerpo.codigo : CODIGO_DESCONOCIDO_FE;
}

export function aErrorFe(error: unknown): ErrorFe {
  if (error instanceof ErrorFe) return error;
  if (!(error instanceof HttpErrorResponse)) return new ErrorFe(CODIGO_DESCONOCIDO_FE, null, { cause: error });
  return new ErrorFe(codigoDe(error), error.status, { cause: error });
}
