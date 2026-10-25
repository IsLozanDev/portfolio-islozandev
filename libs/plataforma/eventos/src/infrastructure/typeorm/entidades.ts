import { EntitySchema } from 'typeorm';
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

/** Se registran en el DataSource de quien use la lib (apps/api y apps/worker). */
export const ENTIDADES_EVT = [EventoProcesadoEntidad, EventoFallidoEntidad];
