const ZONA_PERU = 'America/Lima';
const LOCALE_PERU = 'es-PE';

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat(LOCALE_PERU, { timeZone: ZONA_PERU, dateStyle: 'short', timeStyle: 'short' });
const FORMATO_FECHA = new Intl.DateTimeFormat(LOCALE_PERU, { timeZone: ZONA_PERU, day: '2-digit', month: '2-digit', year: 'numeric' });

/** Instante ISO de la API como fecha de Perú `dd/MM/yyyy`. */
export function formatearFecha(instanteIso: string): string {
  return FORMATO_FECHA.format(new Date(instanteIso));
}

/** Instante ISO de la API como fecha y hora de Perú, p. ej. `20/10/26, 10:00`. */
export function formatearFechaHora(instanteIso: string): string {
  return FORMATO_FECHA_HORA.format(new Date(instanteIso));
}

/** `YYYY-MM-DD` de la API como `dd/MM/yyyy`, sin pasar por `Date` (es una fecha calendario). */
export function formatearFechaCalendario(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}
