import { DataSource } from 'typeorm';
import { EventSchemaValidationError, NoActiveTransactionError, type DomainEvent } from '@vitrina/plataforma/kernel';
import { AlsTenantContext } from '../src/als-tenant-context.js';
import { InMemoryEventSchemaValidator } from '../src/in-memory-event-schema-validator.js';
import { OutboxPublisher } from '../src/outbox.publisher.js';
import { TypeOrmUnitOfWork } from '../src/typeorm-unit-of-work.js';
import { uuidV7 } from '../src/uuid-v7.js';
import { createTempDb, type TempDb } from './support/temp-db.js';

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000001';
const SEDE = 'cccccccc-0000-0000-0000-000000000003';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const evento = (parcial: Partial<DomainEvent>): DomainEvent => ({
  eventType: 'venta.registrada',
  aggregateType: 'venta',
  aggregateId: '0190a8e0-0000-7000-8000-0000000012aa',
  aggregateVersion: 3,
  schemaVersion: 1,
  payload: { numero: 'V-001200' },
  occurredAt: new Date('2026-11-01T10:00:00Z'),
  ...parcial,
});

describe('OutboxPublisher (PostgreSQL 16)', () => {
  let db: TempDb;
  let dataSource: DataSource;
  let tenants: AlsTenantContext;
  let uow: TypeOrmUnitOfWork;
  let publisher: OutboxPublisher;

  beforeAll(async () => {
    db = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: db.url });
    await dataSource.initialize();
    tenants = new AlsTenantContext();
    uow = new TypeOrmUnitOfWork(dataSource, tenants);
    const validator = new InMemoryEventSchemaValidator();
    validator.register('venta.registrada', 1, { type: 'object', required: ['numero'] });
    validator.register('cita.creada', 1, { type: 'object', required: ['fecha_hora'] });
    publisher = new OutboxPublisher(uow, tenants, validator, { next: uuidV7 });
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await db?.drop();
  });

  const filas = (aggregateId: string) => dataSource.query('SELECT * FROM sync.outbox WHERE aggregate_id = $1', [aggregateId]);
  const publicar = (e: DomainEvent, despues?: () => Promise<void>) =>
    tenants.run({ tenantId: TENANT, branchId: SEDE }, () =>
      uow.run(async () => {
        await publisher.publish(e);
        await despues?.();
      }),
    );

  it('TR-CA-225: al confirmar queda el evento con la versión del agregado', async () => {
    const e = evento({});
    await publicar(e);
    const [fila] = await filas(e.aggregateId);
    expect(fila).toMatchObject({
      tenant_id: TENANT,
      sede_id: SEDE,
      aggregate_type: 'venta',
      event_type: 'venta.registrada',
      origin: 'CLOUD',
      payload: { numero: 'V-001200' },
    });
    expect(Number(fila.version)).toBe(3);
    expect(Number(fila.schema_version)).toBe(1);
    expect(fila.event_id).toMatch(UUID_V7);
  });

  it('TR-CA-226: si la transacción se revierte no queda ningún evento', async () => {
    const e = evento({ aggregateId: '0190a8e0-0000-7000-8000-0000000012bb' });
    await expect(
      publicar(e, async () => {
        throw new Error('sin stock');
      }),
    ).rejects.toThrow('sin stock');
    expect(await filas(e.aggregateId)).toHaveLength(0);
  });

  it('TR-CA-227: payload fuera de esquema lanza error y no queda fila', async () => {
    const e = evento({
      eventType: 'cita.creada',
      aggregateType: 'cita',
      aggregateId: '0190a8e0-0000-7000-8000-0000000012cc',
      payload: {},
    });
    await expect(publicar(e)).rejects.toThrow(EventSchemaValidationError);
    expect(await filas(e.aggregateId)).toHaveLength(0);
  });

  it('sin sede en el contexto guarda sede_id nulo', async () => {
    const e = evento({ aggregateId: '0190a8e0-0000-7000-8000-0000000012dd' });
    await tenants.run({ tenantId: TENANT }, () => uow.run(() => publisher.publish(e)));
    expect((await filas(e.aggregateId))[0].sede_id).toBeNull();
  });

  it('publish fuera de UnitOfWork.run lanza NoActiveTransactionError', async () => {
    await tenants.run({ tenantId: TENANT }, async () => {
      await expect(publisher.publish(evento({}))).rejects.toThrow(NoActiveTransactionError);
    });
  });
});
