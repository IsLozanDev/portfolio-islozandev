/** Permisos de plataforma declarados en `manifiesto/plat.manifiesto.json`, para `@Permiso`. */
export const PERMISOS_SEG = {
  manifiestoAplicar: 'plat.manifiesto.aplicar',
  rolGestionar: 'plat.rol.gestionar',
  perfilGestionar: 'plat.perfil.gestionar',
  asignacionOtorgar: 'plat.asignacion.otorgar',
  permisoConsultar: 'plat.permiso.consultar',
  sesionContexto: 'plat.sesion.contexto',
  usuarioInvitar: 'plat.usuario.invitar',
  asignacionRevocar: 'plat.asignacion.revocar',
  seguridadBitacora: 'plat.seguridad.bitacora',
  soporteAutorizar: 'plat.soporte.autorizar',
  soporteSolicitar: 'plat.soporte.solicitar',
} as const;

/** Lo que una sesión de soporte nunca puede usar, aunque el rol aprobado lo tenga (spec 18). */
export const PERMISOS_VETADOS_SOPORTE: readonly string[] = [
  PERMISOS_SEG.soporteAutorizar,
  PERMISOS_SEG.soporteSolicitar,
  PERMISOS_SEG.usuarioInvitar,
  PERMISOS_SEG.asignacionOtorgar,
  PERMISOS_SEG.asignacionRevocar,
  PERMISOS_SEG.rolGestionar,
  PERMISOS_SEG.perfilGestionar,
];
