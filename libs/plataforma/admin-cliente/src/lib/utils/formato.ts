const ZONA_PERU = 'America/Lima';
const LOCALE_PERU = 'es-PE';

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat(LOCALE_PERU, { timeZone: ZONA_PERU, dateStyle: 'short', timeStyle: 'short' });

/** Fecha y hora de Perú, p. ej. `23/10/26, 10:00`. */
export function formatearFechaHora(instante: Date): string {
  return FORMATO_FECHA_HORA.format(instante);
}

/** `YYYY-MM-DD` de la API como `dd/MM/yyyy`, sin pasar por `Date` (es una fecha calendario). */
export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}
