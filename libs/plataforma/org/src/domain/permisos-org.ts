/** Permisos de org declarados en el manifiesto PLAT (`libs/plataforma/seguridad/manifiesto`), para `@Permiso`. */
export const PERMISOS_ORG = {
  tenantCrear: 'plat.tenant.crear',
  tenantCambiarEstado: 'plat.tenant.cambiar_estado',
  empresaCrear: 'plat.empresa.crear',
  sucursalGestionar: 'plat.sucursal.gestionar',
  unidadGestionar: 'plat.unidad.gestionar',
  suscripcionGestionar: 'plat.suscripcion.gestionar',
} as const;
