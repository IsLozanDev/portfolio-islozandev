const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Instante ISO de la API como `dd/MM/yyyy HH:mm` en hora de Lima. */
export function formatearFechaHora(instanteIso: string): string {
  const partes = Object.fromEntries(FORMATO_FECHA_HORA.formatToParts(new Date(instanteIso)).map((parte) => [parte.type, parte.value]));
  return `${partes['day']}/${partes['month']}/${partes['year']} ${partes['hour']}:${partes['minute']}`;
}
