export const PERMISOS_PERSONAS = {
  leer: 'plat.persona.leer',
  registrar: 'plat.persona.registrar',
  editar: 'plat.persona.editar',
  rol: 'plat.persona.rol',
  /** El autocompletar de ubigeo lee el catálogo `UBIGEO` (spec 38). */
  leerCatalogos: 'plat.catalogo.leer',
} as const;
