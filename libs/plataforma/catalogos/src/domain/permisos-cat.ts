/** Permisos de cat declarados en el manifiesto PLAT (`libs/plataforma/seguridad/manifiesto`), para `@Permiso`. */
export const PERMISOS_CAT = {
  gestionar: 'plat.catalogo.gestionar',
  itemGestionar: 'plat.catalogo.item_gestionar',
  leer: 'plat.catalogo.leer',
  personalizar: 'plat.catalogo.personalizar',
  itemPropio: 'plat.catalogo.item_propio',
  /** Spec 19b: sensible y solo del operador (TR-RN-009). */
  importar: 'plat.catalogo.importar',
} as const;
