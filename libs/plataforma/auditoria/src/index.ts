export { AUDITORIA, type AuditoriaPort } from './application/ports/auditoria.port.js';
export { AuditoriaModule } from './auditoria.module.js';
export { ENTIDADES_AUDITORIA } from './infrastructure/typeorm/entidades.js';
export { Auditable, AuditableInterceptor, type OpcionesAuditable } from './interface/auditable.interceptor.js';
export { EVENTOS_AUDITADOS } from './interface/auditoria.consumidor.js';
export {
  ACCION_ACCESO_SENSIBLE,
  FINALIDADES,
  TIPOS_RECURSO_SENSIBLE,
  type EntradaAccesoSensible,
  type EntradaAuditoria,
  type Finalidad,
  type TipoRecursoSensible,
} from './domain/entradas.js';
export { CAMPOS_ENMASCARADOS } from './domain/enmascarado.js';
export {
  AccionInvalidaError,
  ActorRequeridoError,
  AuditoriaNoDisponibleError,
  LongitudExcedidaError,
  TicketRequeridoError,
} from './domain/errores.js';
