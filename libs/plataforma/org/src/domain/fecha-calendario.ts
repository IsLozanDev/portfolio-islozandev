/** Fecha sin hora `YYYY-MM-DD`. Los vencimientos se cuentan en días de calendario de Lima. */
export type FechaCalendario = string;

export const ZONA_VENCIMIENTOS = 'America/Lima';

const MILISEGUNDOS_POR_DIA = 86_400_000;

// en-CA formatea como YYYY-MM-DD.
const formatoLima = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_VENCIMIENTOS,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function fechaCalendarioDe(instante: Date): FechaCalendario {
  return formatoLima.format(instante);
}

/** Días de `desde` a `hasta`; negativo si `hasta` es anterior. */
export function diasEntre(desde: FechaCalendario, hasta: FechaCalendario): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MILISEGUNDOS_POR_DIA);
}

export function sumarDias(fecha: FechaCalendario, dias: number): FechaCalendario {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * MILISEGUNDOS_POR_DIA).toISOString().slice(0, 10);
}
