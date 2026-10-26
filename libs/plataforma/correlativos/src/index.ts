// TR-SEQ: series y correlativos (spec 10). Solo este archivo es público.
export {
  AmbitoSerieInvalidoError,
  SerieAgotadaError,
  SerieDuplicadaError,
  SerieInactivaError,
  SerieInvalidaError,
  SerieNoEncontradaError,
} from './domain/errores.js';
export { PERMISOS_SEQ } from './domain/permisos-seq.js';
export type { Reinicio, TipoDocumento } from './domain/tipos.js';
export { CORRELATIVO_PORT, type CorrelativoPort, type NumeroEmitido, type SolicitudNumero } from './application/ports/correlativo.port.js';
export { CrearSerie, type CrearSerieComando } from './application/crear-serie.js';
export { SembrarSeriesIniciales, type SembrarSeriesInicialesComando } from './application/sembrar-series-iniciales.js';
export { ENTIDADES_SEQ } from './infrastructure/typeorm/entidades.js';
export { ESQUEMAS_SEQ, registrarEsquemasSeq } from './infrastructure/event-schemas.js';
export { CorrelativosModule } from './correlativos.module.js';
