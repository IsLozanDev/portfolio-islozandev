import { ErrorAuth, MENSAJES_AUTH } from '@vitrina/shared/auth';

/** Solo se muestran mensajes de `ErrorAuth`: cualquier otro error podría filtrar detalles internos. */
export function mensajeDeError(error: unknown): string {
  return error instanceof ErrorAuth ? error.message : MENSAJES_AUTH.DESCONOCIDO;
}
