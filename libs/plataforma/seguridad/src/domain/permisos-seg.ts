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
  seguridadBitacoraExportar: 'plat.seguridad.bitacora_exportar',
  soporteAutorizar: 'plat.soporte.autorizar',
  soporteSolicitar: 'plat.soporte.solicitar',
} as const;

/** Permisos de auditoría (spec 20b); la lib auditoria los declara en sus `PERMISOS_AUD`. */
const AUDITORIA_EXPORTAR = 'plat.auditoria.exportar';

/**
 * Lo que una sesión de soporte nunca puede usar, aunque el rol aprobado lo tenga (spec 18). El agente
 * tampoco saca la bitácora del cliente ni la auditoría en un archivo (specs 18b y 20b).
 */
export const PERMISOS_VETADOS_SOPORTE: readonly string[] = [
  PERMISOS_SEG.soporteAutorizar,
  PERMISOS_SEG.soporteSolicitar,
  PERMISOS_SEG.usuarioInvitar,
  PERMISOS_SEG.asignacionOtorgar,
  PERMISOS_SEG.asignacionRevocar,
  PERMISOS_SEG.rolGestionar,
  PERMISOS_SEG.perfilGestionar,
  PERMISOS_SEG.seguridadBitacoraExportar,
  AUDITORIA_EXPORTAR,
];
