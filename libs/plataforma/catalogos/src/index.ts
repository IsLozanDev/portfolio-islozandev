// TR-CAT: catálogos (spec 19a). Solo este archivo es público.
export {
  AlcanceNoPermiteError,
  CatalogoDuplicadoError,
  CatalogoInvalidoError,
  CatalogoNoExisteError,
  CodigoItemDuplicadoError,
  ItemInvalidoError,
  ItemNoEncontradoError,
  ItemReferenciadoError,
  VersionObsoletaError,
} from './domain/errores.js';
export type { AtributosItem } from './domain/atributos-item.js';
export { PERMISOS_CAT } from './domain/permisos-cat.js';
export type { AlcanceCatalogo, MotivoInvalido } from './domain/tipos.js';
export { VERIFICADOR_OPERADOR, type VerificadorOperador } from './application/ports/verificador-operador.js';
export {
  VERIFICADORES_REFERENCIAS,
  type ItemReferenciable,
  type VerificadorReferencias,
} from './application/ports/verificador-referencias.js';
export { ENTIDADES_CAT } from './infrastructure/typeorm/entidades.js';
export { ESQUEMAS_CAT, registrarEsquemasCat } from './infrastructure/event-schemas.js';
