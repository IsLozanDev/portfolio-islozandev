import type { DomainEvent } from './domain-event.js';

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
