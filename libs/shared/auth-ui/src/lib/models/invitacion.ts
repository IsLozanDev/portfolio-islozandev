import { HttpErrorResponse } from '@angular/common/http';

export type CodigoErrorInvitacion =
  | 'INVITACION_NO_ENCONTRADA'
  | 'INVITACION_EXPIRADA'
  | 'INVITACION_NO_DISPONIBLE'
  | 'INVITACION_OTRO_CORREO'
  | 'DEMASIADAS_SOLICITUDES'
  | 'DESCONOCIDO';

/** TR-CA-029 y TR-CA-030 llevan el texto del SRS tal cual, sin punto final. */
export const MENSAJES_INVITACION: Readonly<Record<CodigoErrorInvitacion, string>> = {
  INVITACION_NO_ENCONTRADA: 'La invitación no existe o el enlace está incompleto.',
  INVITACION_EXPIRADA: 'La invitación expiró; solicite una nueva al administrador',
  INVITACION_NO_DISPONIBLE: 'Esta invitación ya se usó o fue anulada.',
  INVITACION_OTRO_CORREO: 'Esta invitación pertenece a otro correo',
  DEMASIADAS_SOLICITUDES: 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.',
  DESCONOCIDO: 'Ocurrió un error. Inténtelo de nuevo.',
};

export class ErrorInvitacion extends Error {
  constructor(
    readonly codigo: CodigoErrorInvitacion,
    options?: { cause?: unknown },
  ) {
    super(MENSAJES_INVITACION[codigo], options);
    this.name = 'ErrorInvitacion';
  }
}

/** Respuestas tal cual de `/v1/seg/invitaciones` (spec 08). */
export interface EstadoInvitacionRespuesta {
  estado: 'VIGENTE';
  tenant_nombre: string;
  expira_en: string;
}

export interface InvitacionAceptadaRespuesta {
  tenant_id: string;
  membresia_id: string;
  refrescar_sesion: boolean;
}

export interface EstadoInvitacion {
  estado: 'VIGENTE';
  tenantNombre: string;
  expiraEn: Date;
}

export interface InvitacionAceptada {
  tenantId: string;
  membresiaId: string;
  refrescarSesion: boolean;
}

export function aEstadoInvitacion(respuesta: EstadoInvitacionRespuesta): EstadoInvitacion {
  return { estado: respuesta.estado, tenantNombre: respuesta.tenant_nombre, expiraEn: new Date(respuesta.expira_en) };
}

export function aInvitacionAceptada(respuesta: InvitacionAceptadaRespuesta): InvitacionAceptada {
  return { tenantId: respuesta.tenant_id, membresiaId: respuesta.membresia_id, refrescarSesion: respuesta.refrescar_sesion };
}

/** Si el cuerpo no trae un código conocido (p. ej. un proxy), se decide por el estado HTTP. */
const CODIGO_POR_ESTADO_HTTP: Readonly<Record<number, CodigoErrorInvitacion>> = {
  403: 'INVITACION_OTRO_CORREO',
  404: 'INVITACION_NO_ENCONTRADA',
  409: 'INVITACION_NO_DISPONIBLE',
  410: 'INVITACION_EXPIRADA',
  429: 'DEMASIADAS_SOLICITUDES',
};

export function aErrorInvitacion(error: unknown): ErrorInvitacion {
  if (error instanceof ErrorInvitacion) return error;
  if (!(error instanceof HttpErrorResponse)) return new ErrorInvitacion('DESCONOCIDO', { cause: error });
  const codigo = codigoDelCuerpo(error.error) ?? CODIGO_POR_ESTADO_HTTP[error.status] ?? 'DESCONOCIDO';
  return new ErrorInvitacion(codigo, { cause: error });
}

function codigoDelCuerpo(cuerpo: unknown): CodigoErrorInvitacion | null {
  const codigo = (cuerpo as { codigo?: unknown } | null)?.codigo;
  return typeof codigo === 'string' && codigo in MENSAJES_INVITACION ? (codigo as CodigoErrorInvitacion) : null;
}
