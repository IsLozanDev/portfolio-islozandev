const ZONA_PERU = 'America/Lima';
const LOCALE_PERU = 'es-PE';

const FORMATO_FECHA = new Intl.DateTimeFormat(LOCALE_PERU, { timeZone: ZONA_PERU, day: '2-digit', month: '2-digit', year: 'numeric' });

/** Instante ISO de la API como fecha de Perú `dd/MM/yyyy`. */
export function formatearFecha(instanteIso: string): string {
  return FORMATO_FECHA.format(new Date(instanteIso));
}
