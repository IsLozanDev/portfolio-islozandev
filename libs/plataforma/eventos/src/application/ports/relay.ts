import type { EventoEntregado } from '../../domain/evento-entregado.js';

/** Lectura de `sync.outbox` entre tenants, en la transacción del cursor. `seq` va en texto (bigint). */
export interface LectorOutbox {
  /** Filas con seq > cursor y más antiguas que el margen (TR-RN-035), por seq. */
  leer(cursor: string, margenSeg: number, limite: number): Promise<EventoEntregado[]>;
  /** Filas con seq <= hastaSeq creadas dentro de la ventana: el re-barrido. */
  leerVentana(hastaSeq: string, ventanaSeg: number, limite: number): Promise<EventoEntregado[]>;
}

export interface AvanceCursor<T> {
  nuevoCursor: string;
  resultado: T;
}

/** Cursor global del relay en `sync.relay_cursor`. */
export interface CursorRelay {
  /**
   * Corre `trabajo` con el cursor bloqueado y lo avanza al confirmar. null si otra instancia tiene
   * el bloqueo: el ciclo se salta (TR-RNF-028). Si `trabajo` lanza, el cursor no avanza.
   */
  conBloqueo<T>(relay: string, trabajo: (cursor: string, lector: LectorOutbox) => Promise<AvanceCursor<T>>): Promise<T | null>;
}

export interface EntregaEncolada {
  consumidor: string;
  evento: EventoEntregado;
  /** BullMQ descarta un trabajo con un id que todavía guarda. */
  idTrabajo: string;
}

/** Colas `evt-<consumidor>`. Si Redis no responde, lanza: el llamador no avanza el cursor. */
export interface ColaEventos {
  encolar(entregas: EntregaEncolada[]): Promise<void>;
}
