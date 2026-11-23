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
