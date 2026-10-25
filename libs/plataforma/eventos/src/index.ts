// TR-EVT: relay del outbox, suscriptores y reproceso (spec 11). Solo este archivo es público.
export {
  EventoNoFallidoError,
  IntentosInvalidosError,
  NombreConsumidorInvalidoError,
  SuscripcionDuplicadaError,
} from './domain/errores.js';
export type { EventoEntregado, OrigenEvento } from './domain/evento-entregado.js';
export type { EstadoFallido } from './domain/evento-fallido.js';
export { PERMISOS_EVT } from './domain/permisos-evt.js';
export { ENTIDADES_EVT } from './infrastructure/typeorm/entidades.js';
export { SuscribirEvento } from './interface/suscribir-evento.decorator.js';
