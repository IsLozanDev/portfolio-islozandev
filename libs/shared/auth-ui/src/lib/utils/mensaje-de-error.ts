import { ErrorAuth, MENSAJES_AUTH } from '@vitrina/shared/auth';
import { ErrorInvitacion } from '../models/invitacion';

/** Solo se muestran mensajes propios: cualquier otro error podría filtrar detalles internos. */
export function mensajeDeError(error: unknown): string {
  return error instanceof ErrorAuth || error instanceof ErrorInvitacion ? error.message : MENSAJES_AUTH.DESCONOCIDO;
}
