const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });

/** Fecha y hora de Perú, p. ej. `04/11/26, 16:30`. */
export function formatearFechaHora(instante: Date): string {
  return FORMATO_FECHA_HORA.format(instante);
}
