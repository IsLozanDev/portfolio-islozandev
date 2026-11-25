const ZONA_HORARIA_EMISION = 'America/Lima';

const formatoHoraLima = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA_HORARIA_EMISION,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** `HH:mm:ss` en Lima: la hora de emisión del comprobante. */
export function horaEnLima(instante: Date): string {
  return formatoHoraLima.format(instante);
}
