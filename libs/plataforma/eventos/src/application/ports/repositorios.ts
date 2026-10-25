import type { EventoEntregado } from '../../domain/evento-entregado.js';
import type { EstadoFallido, EventoFallido } from '../../domain/evento-fallido.js';

/** `sync.evento_procesado`, en la transacción activa. Es la idempotencia por `event_id` (TR-RN-034). */
export interface RegistroProcesados {
  /** false si el consumidor ya había procesado el evento. */
  registrar(consumidor: string, evento: EventoEntregado): Promise<boolean>;
}

/**
 * `sync.evento_fallido` del tenant del contexto, en la transacción activa. Bloqueo optimista por
 * `version`: un cambio concurrente da ConflictError.
 */
export interface RepositorioFallidos {
  buscar(id: string): Promise<EventoFallido | null>;
  buscarPorEvento(consumidor: string, eventId: string): Promise<EventoFallido | null>;
  /** Inserta si no se leyó en esta operación; si se leyó, actualiza exigiendo la versión leída. */
  guardar(fallido: EventoFallido): Promise<void>;
  /** Por `fallido_en` descendente. */
  listar(filtro: FiltroFallidos): Promise<EventoFallido[]>;
}

export interface FiltroFallidos {
  consumidor?: string;
  eventType?: string;
  estado: EstadoFallido;
  limite: number;
}

/** `sync.outbox` con la RLS del tenant del contexto: el sobre completo de un evento, para reprocesarlo. */
export interface LecturaOutbox {
  buscar(eventId: string): Promise<EventoEntregado | null>;
}
