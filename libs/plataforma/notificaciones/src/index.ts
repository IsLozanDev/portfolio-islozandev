// TR-NOT: correo transaccional por Resend con consentimiento, cola con reintentos y estados por webhook firmado
// (spec 42). Solo este archivo es público.
export {
  NOTIFICACION_PORT,
  type Destinatario,
  type EnviarNotificacionComando,
  type NotificacionPort,
  type NotificacionRegistrada,
} from './application/ports/notificacion.port.js';
export type { IntentoEnCurso, TrabajoEnvio } from './application/ports/cola-envios.js';
export { EntregarMensaje } from './application/entregar-mensaje.js';
export { CANALES_NOTIFICACION, type CanalNotificacion } from './domain/canal.js';
export { ESTADOS_MENSAJE, type EstadoMensaje } from './domain/estado-mensaje.js';
export { FINALIDADES_NOTIFICACION, type FinalidadNotificacion } from './domain/finalidad-notificacion.js';
export { EVENTOS_NOT, type MensajeSolicitado } from './domain/eventos-not.js';
export {
  AsuntoDemasiadoLargoError,
  CanalNoHabilitadoError,
  ClaveIdempotenciaInvalidaError,
  ContenidoPlantillaInvalidoError,
  DestinoInvalidoError,
  FirmaWebhookInvalidaError,
  MensajeModificadoError,
  PersonaSinCorreoError,
  PlantillaBaseNoEncontradaError,
  PlantillaNoEncontradaError,
  PromocionalSinPersonaError,
  ProveedorNoConfiguradoError,
  SinPersonalizacionError,
  VariableNoPermitidaError,
  VariablesIncompletasError,
  VersionObsoletaPlantillaError,
} from './domain/errores.js';
// Plantillas personalizables por tenant (spec 43).
export { PERMISOS_PLANTILLAS } from './domain/permisos-not.js';
export { INTENTOS_ENVIO, LIMITE_ENVIOS, NOMBRE_COLA_ENVIOS } from './infrastructure/bullmq/cola-envios.js';
export { ESQUEMAS_NOT, registrarEsquemasNot } from './infrastructure/event-schemas.js';
export { ENTIDADES_NOT } from './infrastructure/typeorm/entidades.js';
export {
  camposEntornoNotificaciones,
  exigirProveedorCorreoEnProduccion,
  type EntornoNotificaciones,
} from './interface/entorno-notificaciones.js';
export { NotificacionesModule, type NotificacionesOpciones, type NotificacionesWorkerOpciones } from './notificaciones.module.js';
