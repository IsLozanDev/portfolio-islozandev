import type { DomainEvent, EventPublisher, EventSchemaValidator, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from './typeorm-unit-of-work.js';

const INSERT_OUTBOX = `
  INSERT INTO sync.outbox
    (event_id, tenant_id, sede_id, aggregate_type, aggregate_id, event_type, version, origin, payload, schema_version, occurred_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, 'CLOUD', $8::jsonb, $9, $10)`;

export class OutboxPublisher implements EventPublisher {
  constructor(
    private readonly uow: TypeOrmUnitOfWork,
    private readonly tenantContext: TenantContext,
    private readonly validator: EventSchemaValidator,
    private readonly ids: IdGenerator,
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    const manager = this.uow.manager;
    this.validator.validate(event);
    const { tenantId, branchId } = this.tenantContext.current();
    await manager.query(INSERT_OUTBOX, [
      this.ids.next(),
      tenantId,
      branchId ?? null,
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      event.aggregateVersion,
      JSON.stringify(event.payload),
      event.schemaVersion,
      event.occurredAt,
    ]);
  }
}
