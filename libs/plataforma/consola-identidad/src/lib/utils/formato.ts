const ZONA_PERU = 'America/Lima';
const LOCALE_PERU = 'es-PE';

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat(LOCALE_PERU, { timeZone: ZONA_PERU, dateStyle: 'short', timeStyle: 'short' });

/** Fecha y hora de Perú de un instante ISO, p. ej. `10/11/26, 10:00 a. m.`. */
export function formatearFechaHora(instanteIso: string): string {
  return FORMATO_FECHA_HORA.format(new Date(instanteIso));
}
