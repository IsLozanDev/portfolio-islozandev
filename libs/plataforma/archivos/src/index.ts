// TR-ARC: carga con URL firmada, análisis en el worker y descarga con URL firmada (spec 33). Solo este archivo es público.
export { ESTADOS_ARCHIVO, MOTIVOS_RECHAZO, type EstadoArchivo, type MotivoRechazo } from './domain/archivo.js';
export { CODIGOS_CATEGORIA, type CodigoCategoria } from './domain/categoria.js';
export {
  AccesoEntidadDenegadoError,
  AlmacenNoDisponibleError,
  ArchivoNoDisponibleError,
  ArchivoNoEncontradoError,
  CategoriaDesconocidaError,
  DatosArchivoInvalidosError,
  MimeNoPermitidoError,
  TamanoExcedidoError,
  VigenciaInvalidaError,
} from './domain/errores.js';
export { EVENTOS_ARC, type ArchivoDisponible, type ArchivoEnCuarentena } from './domain/eventos-arc.js';
export { PERMISOS_ARC } from './domain/permisos-arc.js';
export {
  EVENTO_ERROR_COLA_ANALISIS,
  NOMBRE_COLA_ANALISIS,
  abrirColaAnalisis,
  type ColaAnalisisAbierta,
  type TrabajoAnalisis,
} from './infrastructure/bullmq/cola-analisis.bullmq.js';
export {
  AlmacenArchivosMemoria,
  UrlFirmadaRechazadaError,
  type MotivoUrlRechazada,
} from './infrastructure/memoria/almacen-archivos.memoria.js';
export { ENTIDADES_ARC } from './infrastructure/typeorm/entidades.js';
export { CargasPendientesSql } from './infrastructure/typeorm/cargas-pendientes.sql.js';
export { VIGENCIA_MAXIMA_SEGUNDOS, VIGENCIA_MINIMA_SEGUNDOS } from './domain/vigencia-descarga.js';
