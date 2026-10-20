import type { DomainEvent } from './domain-event.js';

export interface EventSchemaValidator {
  /** Lanza EventSchemaValidationError si el payload no cumple el esquema registrado. */
  validate(event: DomainEvent): void;
}
