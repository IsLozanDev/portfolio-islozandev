import { aCuerpoAsignacion, type CuerpoAsignacion, type FormularioAsignacion } from './asignacion';

export interface DatosInvitacion {
  nombre: string;
  correo: string;
  asignacion: FormularioAsignacion;
}

export interface CuerpoInvitacion extends CuerpoAsignacion {
  nombre: string;
  correo: string;
}

/** Respuesta tal cual de `POST /v1/seg/invitaciones` (spec 08). */
export interface InvitacionEmitidaRespuesta {
  membresia_id: string;
  invitacion_id: string;
  expira_en: string;
  usuario_nuevo: boolean;
  correo_enviado: boolean;
}

export interface InvitacionEmitida {
  membresiaId: string;
  invitacionId: string;
  expiraEn: Date;
  usuarioNuevo: boolean;
  /** false si el enlace a un usuario existente no salió: se reenvía invitando otra vez. */
  correoEnviado: boolean;
}

export function aCuerpoInvitacion(datos: DatosInvitacion): CuerpoInvitacion {
  return { nombre: datos.nombre, correo: datos.correo, ...aCuerpoAsignacion(datos.asignacion) };
}

export function aInvitacionEmitida(respuesta: InvitacionEmitidaRespuesta): InvitacionEmitida {
  return {
    membresiaId: respuesta.membresia_id,
    invitacionId: respuesta.invitacion_id,
    expiraEn: new Date(respuesta.expira_en),
    usuarioNuevo: respuesta.usuario_nuevo,
    correoEnviado: respuesta.correo_enviado,
  };
}
