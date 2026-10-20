import { Ajv, type ValidateFunction } from 'ajv';
import { EventSchemaValidationError, type DomainEvent, type EventSchemaValidator } from '@vitrina/plataforma/kernel';

export class InMemoryEventSchemaValidator implements EventSchemaValidator {
  private readonly ajv = new Ajv({ allErrors: true });
  private readonly validators = new Map<string, ValidateFunction>();

  register(eventType: string, schemaVersion: number, schema: object): void {
    this.validators.set(this.key(eventType, schemaVersion), this.ajv.compile(schema));
  }

  validate(event: DomainEvent): void {
    const validator = this.validators.get(this.key(event.eventType, event.schemaVersion));
    if (!validator) {
      throw new EventSchemaValidationError(`No hay esquema registrado para ${this.key(event.eventType, event.schemaVersion)}`);
    }
    if (!validator(event.payload)) {
      // Solo ruta y regla: el mensaje no debe arrastrar valores del payload (RNF-026).
      const detalle = (validator.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
      throw new EventSchemaValidationError(`Payload de ${event.eventType} fuera de esquema: ${detalle}`);
    }
  }

  private key(eventType: string, schemaVersion: number): string {
    return `${eventType}@${schemaVersion}`;
  }
}
