/** Permisos de PLAT que usa la consola de catálogos. Los tres últimos son sensibles: cada escritura pide MFA. */
export const PERMISOS_CATALOGOS = {
  leer: 'plat.catalogo.leer',
  gestionar: 'plat.catalogo.gestionar',
  itemGestionar: 'plat.catalogo.item_gestionar',
  importar: 'plat.catalogo.importar',
} as const;
