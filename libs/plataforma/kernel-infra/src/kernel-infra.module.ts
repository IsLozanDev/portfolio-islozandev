import { Module, type DynamicModule } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { Clock, EventPublisher, EventSchemaValidator, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { AlsTenantContext } from './als-tenant-context.js';
import { OutboxPublisher } from './outbox.publisher.js';
import { SystemClock } from './system-clock.js';
import { TypeOrmUnitOfWork } from './typeorm-unit-of-work.js';
import { uuidV7 } from './uuid-v7.js';

export const TENANT_CONTEXT = Symbol('TENANT_CONTEXT');
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
export const EVENT_SCHEMA_VALIDATOR = Symbol('EVENT_SCHEMA_VALIDATOR');
export const CLOCK = Symbol('CLOCK');
export const ID_GENERATOR = Symbol('ID_GENERATOR');

export interface KernelInfraOptions {
  readonly dataSource: DataSource;
  readonly validator: EventSchemaValidator;
}

@Module({})
export class KernelInfraModule {
  static register({ dataSource, validator }: KernelInfraOptions): DynamicModule {
    return {
      module: KernelInfraModule,
      global: true,
      providers: [
        { provide: TENANT_CONTEXT, useFactory: (): TenantContext => new AlsTenantContext() },
        {
          provide: TypeOrmUnitOfWork,
          useFactory: (tenants: TenantContext) => new TypeOrmUnitOfWork(dataSource, tenants),
          inject: [TENANT_CONTEXT],
        },
        { provide: UNIT_OF_WORK, useExisting: TypeOrmUnitOfWork },
        { provide: EVENT_SCHEMA_VALIDATOR, useValue: validator },
        { provide: CLOCK, useFactory: (): Clock => new SystemClock() },
        { provide: ID_GENERATOR, useValue: { next: uuidV7 } satisfies IdGenerator },
        {
          provide: EVENT_PUBLISHER,
          useFactory: (uow: TypeOrmUnitOfWork, tenants: TenantContext, validators: EventSchemaValidator, ids: IdGenerator): EventPublisher =>
            new OutboxPublisher(uow, tenants, validators, ids),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, EVENT_SCHEMA_VALIDATOR, ID_GENERATOR],
        },
      ],
      exports: [TENANT_CONTEXT, TypeOrmUnitOfWork, UNIT_OF_WORK, EVENT_PUBLISHER, EVENT_SCHEMA_VALIDATOR, CLOCK, ID_GENERATOR],
    };
  }
}
