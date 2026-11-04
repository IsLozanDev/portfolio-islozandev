import type { AccesoSoporte } from '../../domain/acceso-soporte.js';

/** Accesos de soporte del tenant del contexto. */
export interface RepositorioAccesosSoporte {
  buscar(id: string): Promise<AccesoSoporte | null>;
  /** El PENDIENTE o APROBADO del agente; hay uno como máximo (ux_soporte_abierto). */
  abiertoDe(agenteId: string): Promise<AccesoSoporte | null>;
  abiertosPorTicket(ticket: string): Promise<AccesoSoporte[]>;
  /** Inserta o actualiza con bloqueo optimista por `version`. */
  guardar(acceso: AccesoSoporte): Promise<void>;
}
