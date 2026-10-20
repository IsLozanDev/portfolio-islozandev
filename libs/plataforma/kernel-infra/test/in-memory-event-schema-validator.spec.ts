import { EventSchemaValidationError, type DomainEvent } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator } from '../src/in-memory-event-schema-validator.js';

const evento = (payload: unknown, eventType = 'cita.creada', schemaVersion = 1): DomainEvent => ({
  eventType,
  aggregateType: 'cita',
  aggregateId: '0190a8e0-0000-7000-8000-000000000001',
  aggregateVersion: 1,
  schemaVersion,
  payload,
  occurredAt: new Date(),
});

describe('InMemoryEventSchemaValidator', () => {
  const validator = new InMemoryEventSchemaValidator();
  validator.register('cita.creada', 1, {
    type: 'object',
    required: ['fecha_hora'],
    properties: { fecha_hora: { type: 'string' } },
  });

  it('acepta un payload que cumple el esquema', () => {
    expect(() => validator.validate(evento({ fecha_hora: '2026-11-01T10:00:00Z' }))).not.toThrow();
  });

  it('rechaza un payload sin el campo requerido', () => {
    expect(() => validator.validate(evento({}))).toThrow(EventSchemaValidationError);
  });

  it('el mensaje de error nombra el campo pero no incluye valores del payload', () => {
    const invalido = evento({ fecha_hora: 12345, dni: '87654321' });
    expect(() => validator.validate(invalido)).toThrow(/fecha_hora/);
    expect(() => validator.validate(invalido)).not.toThrow(/87654321/);
  });

  it('rechaza un tipo o versión sin esquema registrado', () => {
    expect(() => validator.validate(evento({}, 'otro.evento'))).toThrow(EventSchemaValidationError);
    expect(() => validator.validate(evento({ fecha_hora: 'x' }, 'cita.creada', 2))).toThrow(EventSchemaValidationError);
  });
});
