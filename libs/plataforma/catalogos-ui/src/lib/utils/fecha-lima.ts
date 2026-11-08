const ZONA_PERU = 'America/Lima';
/** `en-CA` formatea como YYYY-MM-DD. */
const FORMATO_ISO_LIMA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_PERU, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Hoy en Lima como YYYY-MM-DD, el mismo día que usa el back para la vigencia. */
export function hoyEnLima(ahora: Date = new Date()): string {
  return FORMATO_ISO_LIMA.format(ahora);
}

/** YYYY-MM-DD como dd/MM/yyyy, sin pasar por `Date` (es una fecha calendario). */
export function formatearFechaCalendario(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}
