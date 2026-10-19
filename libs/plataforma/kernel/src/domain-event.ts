export interface DomainEvent<P = unknown> {
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly schemaVersion: number;
  readonly payload: P;
  readonly occurredAt: Date;
}
