export type OrigenEvento = 'CLOUD' | 'EDGE';

/** Sobre del evento tal como viaja en la cola: mismos campos que `sync.outbox`. `seq` y `version` son bigint en texto. */
export interface EventoEntregado {
  eventId: string;
  seq: string;
  tenantId: string;
  sedeId: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  version: string;
  origin: OrigenEvento;
  payload: unknown;
  schemaVersion: number;
  occurredAt: string;
}
