import type { Periodo } from './periodo.js';
import type { PlanCuota } from './plan-cuota.js';

/** Fila de idn.cuota. */
export interface EstadoCuota {
  tenantId: string;
  periodo: Periodo;
  plan: PlanCuota;
  incluidas: number;
  consumidas: number;
  avisadoUmbralEn: Date | null;
  avisadoAgotadaEn: Date | null;
  version: number;
}

export const PORCENTAJE_COMPLETO = 100;

/** Porcentaje entero consumido, truncado. Sin incluidas la cuota ya está agotada. */
export function porcentajeConsumo({ incluidas, consumidas }: Pick<EstadoCuota, 'incluidas' | 'consumidas'>): number {
  if (incluidas === 0) return PORCENTAJE_COMPLETO;
  return Math.floor((consumidas * PORCENTAJE_COMPLETO) / incluidas);
}
