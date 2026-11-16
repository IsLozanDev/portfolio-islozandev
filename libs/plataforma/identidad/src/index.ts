// TR-IDN: validación y consulta de documentos de identidad (spec 28). Solo este archivo es público.
export type { DatosDni, DatosRuc, TipoConsultable } from './domain/datos-identidad.js';
export { MOTIVOS_CONSULTA, type MotivoConsulta } from './domain/motivo-consulta.js';
export { PERMISOS_IDN } from './domain/permisos-idn.js';
export {
  DocumentoInvalidoError,
  DocumentoNoEncontradoError,
  ProveedorNoDisponibleError,
  TipoNoConsultableError,
} from './domain/errores.js';
export {
  IDENTIDAD,
  type ConsultaDocumento,
  type IdentidadPort,
  type RespuestaConsulta,
} from './application/ports/identidad.port.js';
export type { HasherDocumento } from './application/ports/persistencia.js';
export { ENTIDADES_IDN } from './infrastructure/typeorm/entidades.js';
export { camposEntornoIdentidad, exigirProveedorReal, type ProveedorElegido } from './interface/entorno-identidad.js';
export { IdentidadModule, type IdentidadOpciones } from './identidad.module.js';
