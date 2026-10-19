export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code: string = 'validation_error';
}

export class NotFoundError extends DomainError {
  readonly code: string = 'not_found';
}

export class ConflictError extends DomainError {
  readonly code: string = 'conflict';
}

export class ForbiddenError extends DomainError {
  readonly code: string = 'forbidden';
}

export class EventSchemaValidationError extends ValidationError {
  override readonly code: string = 'event_schema_invalid';
}

export class MissingTenantContextError extends DomainError {
  readonly code = 'missing_tenant_context';

  constructor() {
    super('No hay tenant en el contexto de la solicitud');
  }
}

export class NoActiveTransactionError extends DomainError {
  readonly code = 'no_active_transaction';

  constructor() {
    super('La operación exige una transacción activa (UnitOfWork.run)');
  }
}
