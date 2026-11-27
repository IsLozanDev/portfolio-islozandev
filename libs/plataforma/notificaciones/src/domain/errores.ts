import { ConflictError, DomainError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';

// Ningún mensaje lleva el destino ni los valores de las variables: los mensajes llegan a logs y respuestas
// (TR-RNF-026). Los nombres de las variables sí, porque son parte de la plantilla.

export class VariablesIncompletasError extends ValidationError {
  override readonly code = 'VARIABLES_INCOMPLETAS';

  constructor(readonly nombres: readonly string[]) {
    super(`Faltan variables de la plantilla: ${nombres.join(', ')}`);
  }
}

/** TR-CA-185. */
export class VariableNoPermitidaError extends ValidationError {
  override readonly code = 'VARIABLE_NO_PERMITIDA';

  constructor(readonly nombres: readonly string[]) {
    super(`Variable no permitida: ${nombres.join(', ')}`);
  }
}

export class AsuntoDemasiadoLargoError extends ValidationError {
  override readonly code = 'ASUNTO_DEMASIADO_LARGO';

  constructor(largoMaximo: number) {
    super(`El asunto renderizado pasa de ${largoMaximo} caracteres`);
  }
}

export class DestinoInvalidoError extends ValidationError {
  override readonly code = 'DESTINO_INVALIDO';

  constructor() {
    super('El correo del destinatario no tiene un formato válido');
  }
}

export class ClaveIdempotenciaInvalidaError extends ValidationError {
  override readonly code = 'CLAVE_IDEMPOTENCIA_INVALIDA';

  constructor() {
    super('La clave de idempotencia debe ser un UUID');
  }
}

export class PlantillaNoEncontradaError extends NotFoundError {
  override readonly code = 'PLANTILLA_NO_ENCONTRADA';

  constructor(codigo: string) {
    super(`No hay una plantilla activa ${codigo} para el canal`);
  }
}

export class CanalNoHabilitadoError extends ValidationError {
  override readonly code = 'CANAL_NO_HABILITADO';

  constructor(canal: string) {
    super(`El canal ${canal} no está habilitado`);
  }
}

export class PersonaSinCorreoError extends ValidationError {
  override readonly code = 'PERSONA_SIN_CORREO';

  constructor() {
    super('La persona no tiene un correo registrado');
  }
}

/** El consentimiento se guarda por persona: sin persona no hay cómo verificarlo. */
export class PromocionalSinPersonaError extends ValidationError {
  override readonly code = 'PROMOCIONAL_SIN_PERSONA';

  constructor() {
    super('Un mensaje promocional exige el personaId del destinatario');
  }
}

export class ProveedorNoConfiguradoError extends DomainError {
  readonly code = 'PROVEEDOR_NO_CONFIGURADO';

  constructor() {
    super('El proveedor de correo no está configurado: RESEND_API_KEY, RESEND_WEBHOOK_SECRET y NOT_REMITENTE');
  }
}

/** TR-RNF-109. */
export class FirmaWebhookInvalidaError extends DomainError {
  readonly code = 'FIRMA_WEBHOOK_INVALIDA';

  constructor() {
    super('La firma del webhook no es válida o su marca de tiempo está fuera de la tolerancia');
  }
}

export class MensajeModificadoError extends ConflictError {
  override readonly code = 'MENSAJE_MODIFICADO';

  constructor() {
    super('El mensaje cambió mientras se procesaba');
  }
}

/** Spec 43: el código no tiene plantilla base en el canal; solo se personalizan códigos con base. */
export class PlantillaBaseNoEncontradaError extends NotFoundError {
  override readonly code = 'PLANTILLA_NO_ENCONTRADA';

  constructor(codigo: string) {
    super(`No hay una plantilla base ${codigo} para el canal`);
  }
}

/** Asunto o cuerpo fuera de sus límites. El mensaje dice qué campo, nunca su contenido. */
export class ContenidoPlantillaInvalidoError extends ValidationError {
  override readonly code = 'CONTENIDO_PLANTILLA_INVALIDO';

  constructor(motivo: string) {
    super(motivo);
  }
}

/** Otra personalización se guardó desde que el cliente leyó la plantilla. */
export class VersionObsoletaPlantillaError extends ConflictError {
  override readonly code = 'VERSION_OBSOLETA';

  constructor() {
    super('La plantilla cambió desde que la abrió; recárguela y vuelva a intentar');
  }
}

/** TR-CA-192. */
export class FechaEnvioNoFuturaError extends ValidationError {
  override readonly code = 'FECHA_ENVIO_NO_FUTURA';

  constructor() {
    super('La fecha de envío debe ser futura');
  }
}

/** Spec 45: evita trabajos diferidos indefinidos en Redis. */
export class FechaEnvioFueraDeHorizonteError extends ValidationError {
  override readonly code = 'FECHA_ENVIO_FUERA_DE_HORIZONTE';

  constructor(horizonteDias: number) {
    super(`La fecha de envío no puede pasar de ${horizonteDias} días desde hoy`);
  }
}

export class ReferenciaInvalidaError extends ValidationError {
  override readonly code = 'REFERENCIA_INVALIDA';

  constructor() {
    super('La referencia debe tener un tipo en minúsculas (p. ej. psi.cita) y un id de 1 a 100 caracteres');
  }
}

/** Otra transacción programó, canceló o ejecutó la misma programación a la vez. */
export class ProgramacionModificadaError extends ConflictError {
  override readonly code = 'PROGRAMACION_MODIFICADA';

  constructor() {
    super('La programación cambió mientras se procesaba');
  }
}

export class SinPersonalizacionError extends NotFoundError {
  override readonly code = 'SIN_PERSONALIZACION';

  constructor(codigo: string) {
    super(`La plantilla ${codigo} no está personalizada`);
  }
}

/** TR-CA-194: la misma respuesta para firma mala, vencido o formato roto, sin datos del token. */
export class EnlaceInvalidoError extends ValidationError {
  override readonly code = 'ENLACE_INVALIDO';

  constructor() {
    super('Enlace inválido o vencido');
  }
}
