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
} as const;
