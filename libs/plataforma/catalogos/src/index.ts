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
  TablaSoloImportacionError,
  VersionObsoletaError,
} from './domain/errores.js';
export type { AtributosItem } from './domain/atributos-item.js';
export { PERMISOS_CAT } from './domain/permisos-cat.js';
export type { AlcanceCatalogo, MotivoInvalido } from './domain/tipos.js';
export { CATALOGO_PORT, type CatalogoPort, type ResultadoValidacion } from './application/ports/catalogo.port.js';
export {
  CALENDARIO_PORT,
  PARAMETROS_CALENDARIO,
  type CalendarioPort,
  type ParametrosCalendario,
} from './application/ports/calendario.port.js';
export { FeriadoInvalidoError } from './domain/feriados/errores.js';
export { VERIFICADOR_OPERADOR, type VerificadorOperador } from './application/ports/verificador-operador.js';
export {
  VERIFICADORES_REFERENCIAS,
  type ItemReferenciable,
  type VerificadorReferencias,
} from './application/ports/verificador-referencias.js';
export { ENTIDADES_CAT } from './infrastructure/typeorm/entidades.js';
export { ProcesarImportacion } from './application/importacion/procesar-importacion.js';
export type { TrabajoImportacion } from './application/ports/importacion.js';
export { NOMBRE_COLA_IMPORTACIONES, abrirColaImportaciones, type ColaAbierta } from './infrastructure/bullmq/cola-importaciones.bullmq.js';
export { crearProcesarImportacion, type PiezasProcesador } from './infrastructure/procesador-importaciones.js';
export { ESQUEMAS_CAT, registrarEsquemasCat } from './infrastructure/event-schemas.js';
export { CatalogosModule, type CatalogosOpciones, type FabricaDe } from './catalogos.module.js';
