// TR-EVT: relay del outbox, suscriptores y reproceso (spec 11). Solo este archivo es público.
export { LIMITE_FALLIDOS_POR_DEFECTO, LIMITE_MAXIMO_FALLIDOS, ListarFallidos, type ConsultaFallidos } from './application/listar-fallidos.js';
export {
  ReprocesarFallidos,
  type MotivoOmision,
  type ReprocesarFallidosComando,
  type ResultadoReproceso,
} from './application/reprocesar-fallidos.js';
export {
  EventoNoFallidoError,
  IntentosInvalidosError,
  NombreConsumidorInvalidoError,
  SuscripcionDuplicadaError,
} from './domain/errores.js';
export type { EventoEntregado, OrigenEvento } from './domain/evento-entregado.js';
export { ESTADOS_FALLIDO, type EstadoFallido, type EventoFallido } from './domain/evento-fallido.js';
export { PERMISOS_EVT } from './domain/permisos-evt.js';
export { EventosModule, type EventosApiOpciones, type EventosWorkerOpciones, type OpcionesRelay } from './eventos.module.js';
export type { PoliticaReintentos } from './infrastructure/bullmq/politica-reintentos.js';
export { ENTIDADES_EVT } from './infrastructure/typeorm/entidades.js';
export { SuscribirEvento } from './interface/suscribir-evento.decorator.js';
