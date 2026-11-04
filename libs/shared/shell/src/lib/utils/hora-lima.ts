const LOCALE_PERU = 'es-PE';
const ZONA_PERU = 'America/Lima';
const FORMATO_HORA = new Intl.DateTimeFormat(LOCALE_PERU, { timeZone: ZONA_PERU, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** «16:30»: la hora en Lima, sin importar la zona del navegador. */
export function horaEnLima(instante: Date): string {
  return FORMATO_HORA.format(instante);
}
