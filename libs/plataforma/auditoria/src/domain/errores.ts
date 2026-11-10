import { DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';

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

/** HTTP 400. Sin fechas, en desorden o de más de 92 días (TR-RNF-002). */
export class RangoInvalidoError extends ValidationError {
  override readonly code = 'RANGO_INVALIDO';

  constructor() {
    super('El rango debe tener fecha inicial y final, en orden, de hasta 92 días');
  }
}

/** HTTP 400. Un filtro con un id que no es uuid, un texto fuera de sus topes o una página fuera de rango. */
export class FiltroAuditoriaInvalidoError extends ValidationError {
  override readonly code = 'SOLICITUD_INVALIDA';

  constructor(campo: string) {
    super(`El filtro ${campo} no es válido`);
  }
}

/** HTTP 403. Sin alcance TENANT solo se ve la sucursal de X-Sucursal-Id (TR-CA-214). */
export class SucursalFueraDeAlcanceError extends ForbiddenError {
  override readonly code = 'SUCURSAL_FUERA_DE_ALCANCE';

  constructor() {
    super('No tiene alcance sobre esa sucursal o sobre todo el tenant');
  }
}

/** HTTP 404. También para una fila fuera del alcance del actor: no revela que existe. */
export class EventoAuditoriaNoEncontradoError extends NotFoundError {
  override readonly code = 'EVENTO_NO_ENCONTRADO';

  constructor() {
    super('El evento de auditoría no existe');
  }
}

/** HTTP 404. El tenant todavía no tiene una verificación de integridad. */
export class SinVerificacionesError extends NotFoundError {
  override readonly code = 'SIN_VERIFICACIONES';

  constructor() {
    super('Todavía no hay una verificación de integridad de la auditoría');
  }
}

/** HTTP 422. El mismo mensaje que la exportación de la bitácora (spec 18b). */
export class ExportacionDemasiadoGrandeError extends DomainError {
  readonly code = 'EXPORTACION_DEMASIADO_GRANDE';

  constructor(
    readonly filas: number,
    readonly maximo: number,
  ) {
    super(`La exportación tiene ${conMiles(filas)} filas; el máximo es ${conMiles(maximo)}. Acote el rango o los filtros`);
  }
}

/** «10 000»: separador de miles con espacio, como los mensajes del spec. */
function conMiles(numero: number): string {
  return String(numero).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
