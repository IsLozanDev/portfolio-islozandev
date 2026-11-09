const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

/** Día de la semana de una fecha calendario YYYY-MM-DD, en minúsculas. Se calcula en UTC para no depender de la zona. */
export function diaDeLaSemana(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()];
}
