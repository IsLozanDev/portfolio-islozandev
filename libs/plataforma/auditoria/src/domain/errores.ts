import { DomainError, ForbiddenError, ValidationError } from '@vitrina/plataforma/kernel';

export class AccionInvalidaError extends ValidationError {
  override readonly code = 'ACCION_INVALIDA';

  constructor(accion: string) {
    super(`La acción «${accion}» debe tener el formato producto.recurso.accion, en minúsculas`);
  }
}

export class LongitudExcedidaError extends ValidationError {
  override readonly code = 'LONGITUD_EXCEDIDA';

  constructor(campo: string, maximo: number) {
    super(`El campo ${campo} admite hasta ${maximo} caracteres`);
  }
}

/** TR-CA-212: el acceso de soporte siempre lleva el ticket que lo justifica. */
export class TicketRequeridoError extends ValidationError {
  override readonly code = 'TICKET_REQUERIDO';

  constructor() {
    super('Un acceso con finalidad SOPORTE exige el ticket');
  }
}

/** Un acceso sensible siempre tiene una persona que lo ve: sin usuario en el contexto no se registra. */
export class ActorRequeridoError extends ForbiddenError {
  override readonly code = 'ACTOR_REQUERIDO';

  constructor() {
    super('El acceso a datos sensibles exige un usuario identificado');
  }
}

/** HTTP 503. Lo auditado no se confirma si no quedó registrado (TR-RNF-013). */
export class AuditoriaNoDisponibleError extends DomainError {
  readonly code = 'AUDITORIA_NO_DISPONIBLE';

  constructor() {
    super('No se pudo registrar la auditoría; la operación no se confirmó, intente de nuevo');
  }
}
