/** Permisos de idn declarados en el manifiesto PLAT (`libs/plataforma/seguridad/manifiesto`), para `@Permiso`. */
export const PERMISOS_IDN = {
  validar: 'plat.identidad.validar',
  consultar: 'plat.identidad.consultar',
  cuota: 'plat.identidad.cuota',
  cuotaGestionar: 'plat.identidad.cuota_gestionar',
  proveedor: 'plat.identidad.proveedor',
} as const;
