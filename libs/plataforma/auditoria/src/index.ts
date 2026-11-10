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
  EventoAuditoriaNoEncontradoError,
  ExportacionDemasiadoGrandeError,
  FiltroAuditoriaInvalidoError,
  LongitudExcedidaError,
  RangoInvalidoError,
  SinVerificacionesError,
  SucursalFueraDeAlcanceError,
  TicketRequeridoError,
} from './domain/errores.js';

// Consulta e integridad (spec 20b).
export { PERMISOS_AUD } from './domain/permisos-aud.js';
export { calcularCambios, type Cambio } from './domain/cambios.js';
export type { FiltroAuditoria, Paginacion, TipoEventoAuditoria } from './domain/filtro-auditoria.js';
export type { ModoVerificacion, MotivoRotura, Verificacion } from './domain/verificacion.js';
export { EVENTOS_AUD, type IntegridadRota } from './domain/eventos.js';
export { ESQUEMAS_AUD, registrarEsquemasAud } from './infrastructure/event-schemas.js';
export { VerificarIntegridad } from './application/verificar-integridad.js';
export { VerificarTodosLosTenants, type ResultadoVerificacionDiaria } from './application/verificar-todos-los-tenants.js';
