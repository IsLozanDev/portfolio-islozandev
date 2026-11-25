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
// Recordatorios programados por referencia (spec 45).
export type { NotificacionProgramada, ProgramarNotificacionComando } from './application/ports/notificacion.port.js';
export type { ReferenciaProgramacion } from './domain/referencia-programacion.js';
export { ESTADOS_PROGRAMACION, HORIZONTE_MAXIMO_DIAS, type EstadoProgramacion } from './domain/programacion.js';
export type { ProgramacionRegistrada } from './domain/eventos-not.js';
export {
  FechaEnvioFueraDeHorizonteError,
  FechaEnvioNoFuturaError,
  ProgramacionModificadaError,
  ReferenciaInvalidaError,
} from './domain/errores.js';
export type { TrabajoProgramacion } from './application/ports/cola-programaciones.js';
export { EjecutarProgramacion, type ResultadoEjecucion } from './application/programaciones/ejecutar-programacion.js';
export { BarrerProgramacionesAtrasadas, type ResultadoBarrido } from './application/programaciones/barrer-programaciones-atrasadas.js';
export { NOMBRE_COLA_PROGRAMACIONES, NOMBRE_TRABAJO_EJECUCION } from './infrastructure/bullmq/cola-programaciones.js';
export { INTENTOS_ENVIO, LIMITE_ENVIOS, NOMBRE_COLA_ENVIOS } from './infrastructure/bullmq/cola-envios.js';
export { ESQUEMAS_NOT, registrarEsquemasNot } from './infrastructure/event-schemas.js';
export { ENTIDADES_NOT } from './infrastructure/typeorm/entidades.js';
export {
  camposEntornoNotificaciones,
  exigirProveedorCorreoEnProduccion,
  type EntornoNotificaciones,
} from './interface/entorno-notificaciones.js';
export { NotificacionesModule, type NotificacionesOpciones, type NotificacionesWorkerOpciones } from './notificaciones.module.js';
