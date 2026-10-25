import type { EventoEntregado } from '../../domain/evento-entregado.js';

/** Efecto de un consumidor. Corre en la transacción de la entrega, con el tenant del evento. */
export type Manejador = (evento: EventoEntregado) => Promise<void>;

/** Suscripciones declaradas con `@SuscribirEvento`, fijas desde el arranque. */
export interface RegistroSuscripciones {
  consumidoresDe(eventType: string): string[];
  manejador(consumidor: string, eventType: string): Manejador | null;
  consumidores(): string[];
}
