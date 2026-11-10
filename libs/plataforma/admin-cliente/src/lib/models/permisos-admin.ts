/** Permisos de PLAT que usa la administración del cliente (manifiesto PLAT 1.8.0). */
export const PERMISOS_ADMIN = {
  usuarioInvitar: 'plat.usuario.invitar',
  asignacionOtorgar: 'plat.asignacion.otorgar',
  asignacionRevocar: 'plat.asignacion.revocar',
  rolGestionar: 'plat.rol.gestionar',
  perfilGestionar: 'plat.perfil.gestionar',
  organizacionConsultar: 'plat.organizacion.consultar',
  empresaCrear: 'plat.empresa.crear',
  sucursalGestionar: 'plat.sucursal.gestionar',
  unidadGestionar: 'plat.unidad.gestionar',
  seguridadBitacora: 'plat.seguridad.bitacora',
  /** Sensible: exige MFA reciente (spec 18b). */
  seguridadBitacoraExportar: 'plat.seguridad.bitacora_exportar',
  soporteAutorizar: 'plat.soporte.autorizar',
  auditoriaConsultar: 'plat.auditoria.consultar',
  /** Sensible: exige MFA reciente (spec 20b). */
  auditoriaExportar: 'plat.auditoria.exportar',
} as const;
