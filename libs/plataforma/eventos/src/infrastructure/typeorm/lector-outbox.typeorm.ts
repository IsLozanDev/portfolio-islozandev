import type { EntityManager } from 'typeorm';
import type { LectorOutbox } from '../../application/ports/relay.js';
import type { EventoEntregado, OrigenEvento } from '../../domain/evento-entregado.js';

// SQL crudo justificado (regla 11): llamadas a las funciones SECURITY DEFINER sync.read_events*, que
// el ORM no expresa. bigint como texto para no perder precisión en JavaScript.
const COLUMNAS = `event_id, seq::text AS seq, tenant_id, sede_id, aggregate_type, aggregate_id, event_type,
  version::text AS version, origin, payload, schema_version, occurred_at`;
const LEER = `SELECT ${COLUMNAS} FROM sync.read_events($1, make_interval(secs => $2), $3)`;
const LEER_VENTANA = `SELECT ${COLUMNAS} FROM sync.read_events_ventana($1, make_interval(secs => $2), $3)`;

interface FilaOutbox {
  event_id: string;
  seq: string;
  tenant_id: string;
  sede_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  version: string;
  origin: OrigenEvento;
  payload: unknown;
  schema_version: number;
  occurred_at: Date;
}

/** Lee con el EntityManager de la transacción del cursor. */
export class LectorOutboxTypeOrm implements LectorOutbox {
  constructor(private readonly manager: EntityManager) {}

  leer(cursor: string, margenSeg: number, limite: number): Promise<EventoEntregado[]> {
    return this.consultar(LEER, [cursor, margenSeg, limite]);
  }

  leerVentana(hastaSeq: string, ventanaSeg: number, limite: number): Promise<EventoEntregado[]> {
    return this.consultar(LEER_VENTANA, [hastaSeq, ventanaSeg, limite]);
  }

  private async consultar(sql: string, parametros: unknown[]): Promise<EventoEntregado[]> {
    const filas: FilaOutbox[] = await this.manager.query(sql, parametros);
    return filas.map(eventoDesdeFila);
  }
}

function eventoDesdeFila(fila: FilaOutbox): EventoEntregado {
  return {
    eventId: fila.event_id,
    seq: fila.seq,
    tenantId: fila.tenant_id,
    sedeId: fila.sede_id,
    aggregateType: fila.aggregate_type,
    aggregateId: fila.aggregate_id,
    eventType: fila.event_type,
    version: fila.version,
    origin: fila.origin,
    payload: fila.payload,
    schemaVersion: fila.schema_version,
    occurredAt: fila.occurred_at.toISOString(),
  };
}
