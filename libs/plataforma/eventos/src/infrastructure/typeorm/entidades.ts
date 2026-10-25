import { EntitySchema } from 'typeorm';
import type { OrigenEvento } from '../../domain/evento-entregado.js';
import type { EstadoFallido } from '../../domain/evento-fallido.js';

// Mapeo ORM de las tablas del relay en sync. El esquema lo definen las migraciones de db/ (sin synchronize).

export interface FilaEventoProcesado {
  consumidor: string;
  eventId: string;
  tenantId: string;
  /** Lo fija la base. */
  procesadoEn?: Date;
}

export const EventoProcesadoEntidad = new EntitySchema<FilaEventoProcesado>({
  name: 'EventoProcesado',
  schema: 'sync',
  tableName: 'evento_procesado',
  columns: {
    consumidor: { type: 'varchar', length: 40, primary: true },
    eventId: { name: 'event_id', type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    procesadoEn: { name: 'procesado_en', type: 'timestamptz', insert: false, update: false },
  },
});

export interface FilaEventoFallido {
  id: string;
  tenantId: string;
  consumidor: string;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  error: string;
  intentos: number;
  estado: EstadoFallido;
  fallidoEn: Date;
  reprocesadoPor: string | null;
  reprocesadoEn: Date | null;
  /** bigint: node-pg lo devuelve como string. */
  version: string;
}

export const EventoFallidoEntidad = new EntitySchema<FilaEventoFallido>({
  name: 'EventoFallido',
  schema: 'sync',
  tableName: 'evento_fallido',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid', update: false },
    consumidor: { type: 'varchar', length: 40, update: false },
    eventId: { name: 'event_id', type: 'uuid', update: false },
    eventType: { name: 'event_type', type: 'text', update: false },
    aggregateType: { name: 'aggregate_type', type: 'text', update: false },
    aggregateId: { name: 'aggregate_id', type: 'uuid', update: false },
    error: { type: 'varchar', length: 1000 },
    intentos: { type: 'integer' },
    estado: { type: 'varchar', length: 12 },
    fallidoEn: { name: 'fallido_en', type: 'timestamptz' },
    reprocesadoPor: { name: 'reprocesado_por', type: 'uuid', nullable: true },
    reprocesadoEn: { name: 'reprocesado_en', type: 'timestamptz', nullable: true },
    // Bloqueo optimista propio (WHERE version = previa): la versión la lleva el repositorio, no TypeORM.
    version: { type: 'bigint' },
  },
});

export interface FilaRelayCursor {
  relay: string;
  /** bigint: node-pg lo devuelve como string. */
  ultimoSeq: string;
  actualizadoEn: Date;
}

export const RelayCursorEntidad = new EntitySchema<FilaRelayCursor>({
  name: 'RelayCursor',
  schema: 'sync',
  tableName: 'relay_cursor',
  columns: {
    relay: { type: 'varchar', length: 40, primary: true },
    ultimoSeq: { name: 'ultimo_seq', type: 'bigint' },
    actualizadoEn: { name: 'actualizado_en', type: 'timestamptz' },
  },
});

export interface FilaOutbox {
  eventId: string;
  /** bigint: node-pg lo devuelve como string. */
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
  occurredAt: Date;
}

/** Solo lectura: escribe el outbox `OutboxPublisher` de kernel-infra. */
export const OutboxEntidad = new EntitySchema<FilaOutbox>({
  name: 'EventoOutbox',
  schema: 'sync',
  tableName: 'outbox',
  columns: {
    eventId: { name: 'event_id', type: 'uuid', primary: true },
    seq: { type: 'bigint', insert: false, update: false },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    sedeId: { name: 'sede_id', type: 'uuid', nullable: true },
    aggregateType: { name: 'aggregate_type', type: 'text' },
    aggregateId: { name: 'aggregate_id', type: 'uuid' },
    eventType: { name: 'event_type', type: 'text' },
    version: { type: 'bigint' },
    origin: { type: 'text' },
    payload: { type: 'jsonb' },
    schemaVersion: { name: 'schema_version', type: 'smallint' },
    occurredAt: { name: 'occurred_at', type: 'timestamptz' },
  },
});

/** Se registran en el DataSource de quien use la lib (apps/api y apps/worker). */
export const ENTIDADES_EVT = [EventoProcesadoEntidad, EventoFallidoEntidad, RelayCursorEntidad, OutboxEntidad];
