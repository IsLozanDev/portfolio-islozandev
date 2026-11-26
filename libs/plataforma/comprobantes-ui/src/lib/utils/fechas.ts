const ZONA_PERU = 'America/Lima';
const LOCALE_PERU = 'es-PE';
const FORMATO_FECHA_CORTA = new Intl.DateTimeFormat(LOCALE_PERU, { timeZone: ZONA_PERU, day: '2-digit', month: '2-digit', year: '2-digit' });
const FORMATO_FECHA_HORA_CORTA = new Intl.DateTimeFormat(LOCALE_PERU, {
  timeZone: ZONA_PERU,
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Instante ISO de la API como `dd/mm/aa` en Lima, como en el canvas. */
export function formatoFechaCorta(instanteIso: string): string {
  return FORMATO_FECHA_CORTA.format(new Date(instanteIso));
}

/** Instante ISO como `dd/mm/aa, hh:mm` en Lima. */
export function formatoFechaHoraCorta(instanteIso: string): string {
  return FORMATO_FECHA_HORA_CORTA.format(new Date(instanteIso));
}
