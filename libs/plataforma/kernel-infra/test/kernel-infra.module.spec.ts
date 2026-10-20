import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AlsTenantContext } from '../src/als-tenant-context.js';
import { InMemoryEventSchemaValidator } from '../src/in-memory-event-schema-validator.js';
import {
  CLOCK,
  EVENT_PUBLISHER,
  EVENT_SCHEMA_VALIDATOR,
  ID_GENERATOR,
  KernelInfraModule,
  TENANT_CONTEXT,
  UNIT_OF_WORK,
} from '../src/kernel-infra.module.js';
import { OutboxPublisher } from '../src/outbox.publisher.js';
import { SystemClock } from '../src/system-clock.js';
import { TypeOrmUnitOfWork } from '../src/typeorm-unit-of-work.js';

describe('KernelInfraModule', () => {
  it('registra los puertos del kernel con sus adaptadores', async () => {
    const validator = new InMemoryEventSchemaValidator();
    const modulo = await Test.createTestingModule({
      imports: [KernelInfraModule.register({ dataSource: new DataSource({ type: 'postgres' }), validator })],
    }).compile();

    expect(modulo.get(TENANT_CONTEXT)).toBeInstanceOf(AlsTenantContext);
    expect(modulo.get(UNIT_OF_WORK)).toBeInstanceOf(TypeOrmUnitOfWork);
    expect(modulo.get(UNIT_OF_WORK)).toBe(modulo.get(TypeOrmUnitOfWork));
    expect(modulo.get(EVENT_PUBLISHER)).toBeInstanceOf(OutboxPublisher);
    expect(modulo.get(EVENT_SCHEMA_VALIDATOR)).toBe(validator);
    expect(modulo.get(CLOCK)).toBeInstanceOf(SystemClock);
    expect(modulo.get(ID_GENERATOR).next()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
