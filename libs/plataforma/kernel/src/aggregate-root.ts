import type { DomainEvent } from './domain-event.js';

export type RaisedEvent<P = unknown> = Omit<DomainEvent<P>, 'aggregateId' | 'aggregateVersion' | 'occurredAt'>;

export abstract class AggregateRoot {
  private currentVersion: number;
  private pending: DomainEvent[] = [];

  protected constructor(
    readonly id: string,
    version = 0,
  ) {
    this.currentVersion = version;
  }

  get version(): number {
    return this.currentVersion;
  }

  protected raise(event: RaisedEvent): void {
    this.currentVersion += 1;
    this.pending.push({
      ...event,
      aggregateId: this.id,
      aggregateVersion: this.currentVersion,
      occurredAt: new Date(),
    });
  }

  pullEvents(): DomainEvent[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }
}
