import type { JobsOptions } from 'bullmq';

export interface PoliticaReintentos {
  /** Intentos por entrega (RF-095: 8). */
  intentos: number;
  /** Base del backoff exponencial. */
  esperaBaseMs: number;
  /** Tope del backoff: el exponencial de BullMQ no lo trae. */
  esperaMaximaMs: number;
}

/** Tipo propio de backoff: lo resuelve `esperaAntesDelReintento` en los `Worker`. */
export const BACKOFF_EXPONENCIAL_CON_TOPE = 'exponencial-con-tope';

const SEGUNDOS_POR_HORA = 3600;
const SEGUNDOS_POR_SEMANA = 7 * 24 * SEGUNDOS_POR_HORA;

/**
 * `jobId` fijo: BullMQ descarta un trabajo con un id que todavía guarda. Los completados se guardan una hora,
 * más que la ventana del re-barrido; los fallidos, una semana.
 */
export function opcionesDeTrabajo(politica: PoliticaReintentos, idTrabajo: string): JobsOptions {
  return {
    jobId: idTrabajo,
    attempts: politica.intentos,
    backoff: { type: BACKOFF_EXPONENCIAL_CON_TOPE, delay: politica.esperaBaseMs },
    removeOnComplete: { age: SEGUNDOS_POR_HORA },
    removeOnFail: { age: SEGUNDOS_POR_SEMANA },
  };
}

/** Espera antes del reintento `intentosHechos + 1`: base, 2 × base, 4 × base... hasta el tope. */
export function esperaAntesDelReintento(politica: PoliticaReintentos, intentosHechos: number): number {
  return Math.min(politica.esperaBaseMs * 2 ** (intentosHechos - 1), politica.esperaMaximaMs);
}
