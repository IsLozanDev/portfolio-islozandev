import type { DataSource, EntityManager } from 'typeorm';
import { SystemClock, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DespacharLote, type OpcionesDespacho } from '../../src/application/despachar-lote.js';
import type { ColaEventos, EntregaEncolada } from '../../src/application/ports/relay.js';
import type { RegistroSuscripciones } from '../../src/application/ports/suscripciones.js';
import { CursorRelayTypeOrm } from '../../src/infrastructure/typeorm/cursor-relay.typeorm.js';

/** Sin re-barrido: así una prueba ve solo lo que entrega el margen. */
export const SIN_REBARRIDO = Number.POSITIVE_INFINITY;

/** Cola falsa: registra lo encolado y puede simular Redis caído. */
export class ColaEnMemoria implements ColaEventos {
  readonly entregas: EntregaEncolada[] = [];
  caida = false;

  async encolar(entregas: EntregaEncolada[]): Promise<void> {
    if (this.caida) throw new Error('Redis no responde');
    this.entregas.push(...entregas);
  }

  vecesEncolado(consumidor: string, eventId: string): number {
    return this.entregas.filter((entrega) => entrega.consumidor === consumidor && entrega.evento.eventId === eventId).length;
  }
}

export function crearRelay(
  dataSource: DataSource,
  cola: ColaEventos,
  suscripciones: RegistroSuscripciones,
  opciones: Partial<OpcionesDespacho> = {},
): DespacharLote {
  return new DespacharLote(
    { cursor: new CursorRelayTypeOrm(dataSource), cola, suscripciones, reloj: new SystemClock(), depurar: () => undefined },
    { margenSeg: 0, lote: 500, ventanaSeg: 300, rebarridoCadaMs: SIN_REBARRIDO, ...opciones },
  );
}

/** Inserta como superusuario (salta la RLS). `created_at` es now() de la transacción de `ejecutor`. */
export async function insertarEnOutbox(ejecutor: DataSource | EntityManager, eventType: string, tenantId = uuidV7()): Promise<string> {
  const eventId = uuidV7();
  await ejecutor.query(
    `INSERT INTO sync.outbox (event_id, tenant_id, aggregate_type, aggregate_id, event_type, version, payload, schema_version, occurred_at)
     VALUES ($1, $2, 'cita', $3, $4, 1, '{}', 1, now())`,
    [eventId, tenantId, uuidV7(), eventType],
  );
  return eventId;
}

/** Con el `EntityManager` de una transacción abierta, ve también su fila sin confirmar. */
export async function seqDe(ejecutor: DataSource | EntityManager, eventId: string): Promise<bigint> {
  const [fila] = await ejecutor.query(`SELECT seq::text AS seq FROM sync.outbox WHERE event_id = $1`, [eventId]);
  return BigInt(fila.seq);
}

export async function cursorActual(dataSource: DataSource): Promise<bigint> {
  const [fila] = await dataSource.query(`SELECT ultimo_seq::text AS seq FROM sync.relay_cursor WHERE relay = 'principal'`);
  return BigInt(fila.seq);
}

export const pausa = (milisegundos: number) => new Promise<void>((resolver) => setTimeout(resolver, milisegundos));
