const ZONA_PERU = 'America/Lima';
const ANIO_EN_LIMA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_PERU, year: 'numeric' });

/** El año de hoy en Lima, no el de UTC: el 31/12 a las 20:00 de Lima ya es 1 de enero en UTC. */
export function anioEnLima(ahora: Date = new Date()): number {
  return Number(ANIO_EN_LIMA.format(ahora));
}

/** YYYY-MM-DD como dd/MM/yyyy, sin pasar por `Date` (es una fecha calendario). */
export function formatearFechaCalendario(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** YYYY-MM-DD como `Date` local a medianoche, como la entrega el datepicker. */
export function fechaDesdeIso(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

/** `Date` local del datepicker como YYYY-MM-DD. */
export function isoDesdeFecha(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}
