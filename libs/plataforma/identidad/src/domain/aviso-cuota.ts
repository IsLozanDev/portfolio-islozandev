import { PORCENTAJE_COMPLETO, type EstadoCuota } from './estado-cuota.js';

export type AvisoCuota = 'UMBRAL' | 'AGOTADA';

/** Avisos que la cuota merece y todavía no se marcaron. Con 0 incluidas solo cuenta el de agotada. */
export function avisosPendientes(estado: EstadoCuota, umbralPorcentaje: number): AvisoCuota[] {
  const avisos: AvisoCuota[] = [];
  if (alcanzoUmbral(estado, umbralPorcentaje) && estado.avisadoUmbralEn === null) avisos.push('UMBRAL');
  if (estado.consumidas >= estado.incluidas && estado.avisadoAgotadaEn === null) avisos.push('AGOTADA');
  return avisos;
}

function alcanzoUmbral({ incluidas, consumidas }: EstadoCuota, umbralPorcentaje: number): boolean {
  if (incluidas === 0) return false;
  return consumidas * PORCENTAJE_COMPLETO >= incluidas * umbralPorcentaje;
}
