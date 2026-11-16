/** Las cuotas se abren y cierran a medianoche de Lima, no de UTC. */
export const ZONA_CUOTA = 'America/Lima';

/** Mes de cuota en formato AAAA-MM, igual que el CHECK de idn.cuota.periodo. */
export type Periodo = string;

const FORMATO_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

const FORMATEADOR_PERIODO = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_CUOTA, year: 'numeric', month: '2-digit' });

export function periodoDe(instante: Date): Periodo {
  const partes = FORMATEADOR_PERIODO.formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((candidata) => candidata.type === tipo)?.value;
  return `${parte('year')}-${parte('month')}`;
}

export function esPeriodoValido(texto: string): texto is Periodo {
  return FORMATO_PERIODO.test(texto);
}

/** Negativo si `primero` es anterior; el formato fijo hace que el orden de texto sea el cronológico. */
export function compararPeriodos(primero: Periodo, segundo: Periodo): number {
  if (primero === segundo) return 0;
  return primero < segundo ? -1 : 1;
}
