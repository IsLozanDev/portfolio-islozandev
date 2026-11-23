export const HORA_INICIO_PROMOCIONAL = 8;
export const HORA_FIN_PROMOCIONAL = 20;

const MILISEGUNDOS_POR_MINUTO = 60_000;
const DIAS_HASTA_MANANA = 1;

interface FechaLocal {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

/**
 * TR-RN-025: un promocional sale entre las 08:00 y las 20:00 (20:00 excluido) de la zona. Devuelve `null` si
 * el instante cae dentro; si no, las 08:00 del mismo día (antes de las 08:00) o del día siguiente (desde las
 * 20:00). El desfase se mide en el instante: America/Lima no tiene horario de verano.
 */
export function programarPromocional(instante: Date, zona: string): Date | null {
  const local = fechaLocal(instante, zona);
  if (local.hora >= HORA_INICIO_PROMOCIONAL && local.hora < HORA_FIN_PROMOCIONAL) return null;
  const diasDeEspera = local.hora >= HORA_FIN_PROMOCIONAL ? DIAS_HASTA_MANANA : 0;
  const inicioLocalComoUtc = Date.UTC(local.anio, local.mes - 1, local.dia + diasDeEspera, HORA_INICIO_PROMOCIONAL);
  return new Date(inicioLocalComoUtc - desfaseMs(instante, local));
}

function fechaLocal(instante: Date, zona: string): FechaLocal {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((parte) => parte.type === tipo)?.value);
  return { anio: valor('year'), mes: valor('month'), dia: valor('day'), hora: valor('hour'), minuto: valor('minute') };
}

/** Lo que la hora local va adelantada respecto de UTC (negativo en Lima). */
function desfaseMs(instante: Date, local: FechaLocal): number {
  const localComoUtc = Date.UTC(local.anio, local.mes - 1, local.dia, local.hora, local.minuto);
  const instanteAlMinuto = Math.floor(instante.getTime() / MILISEGUNDOS_POR_MINUTO) * MILISEGUNDOS_POR_MINUTO;
  return localComoUtc - instanteAlMinuto;
}
