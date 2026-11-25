export const PERMISOS_PERSONAS = {
  leer: 'plat.persona.leer',
  registrar: 'plat.persona.registrar',
  editar: 'plat.persona.editar',
  rol: 'plat.persona.rol',
  /** Descartar duplicados y fusionar; sensible (aal2, spec 39). */
  fusionar: 'plat.persona.fusionar',
  /** El autocompletar de ubigeo lee el catálogo `UBIGEO` (spec 38). */
  leerCatalogos: 'plat.catalogo.leer',
} as const;
