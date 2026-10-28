/**
 * Permisos de org para `@Permiso`. Los que tienen endpoint están en el manifiesto PLAT
 * (`libs/plataforma/seguridad/manifiesto`); `suscripcionGestionar` todavía no (TR-RF-005 sin HTTP).
 */
export const PERMISOS_ORG = {
  tenantCrear: 'plat.tenant.crear',
  tenantConsultar: 'plat.tenant.consultar',
  tenantCambiarEstado: 'plat.tenant.cambiar_estado',
  organizacionConsultar: 'plat.organizacion.consultar',
  empresaCrear: 'plat.empresa.crear',
  sucursalGestionar: 'plat.sucursal.gestionar',
  unidadGestionar: 'plat.unidad.gestionar',
  suscripcionGestionar: 'plat.suscripcion.gestionar',
} as const;
