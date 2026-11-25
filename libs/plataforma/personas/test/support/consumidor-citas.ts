import type { PersonaFusionada } from '../../src/domain/eventos-per.js';

/** Lo que el relay entrega de un evento del outbox, con los campos que usa el consumidor. */
export interface EventoDeFusion {
  eventId: string;
  payload: PersonaFusionada;
}

/**
 * Consumidor de prueba de `persona.fusionada` (TR-CA-107): un producto de agenda que reasigna sus citas de la
 * absorbida a la conservada. Idempotente por `event_id` (TR-RN-034). En plataforma no hay consumidor real:
 * el de R2 es SazónPOS (CC-06).
 */
export class ConsumidorCitasDePrueba {
  /** Cita → persona. */
  readonly citas = new Map<string, string>();
  readonly eventosProcesados = new Set<string>();
  reasignaciones = 0;

  personaFusionada({ eventId, payload }: EventoDeFusion): void {
    if (this.eventosProcesados.has(eventId)) return;
    for (const [cita, personaId] of this.citas) {
      if (personaId !== payload.persona_absorbida_id) continue;
      this.citas.set(cita, payload.persona_conservada_id);
      this.reasignaciones += 1;
    }
    this.eventosProcesados.add(eventId);
  }
}
