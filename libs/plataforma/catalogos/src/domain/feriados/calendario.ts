import { esFecha } from '../vigencia.js';
import { FeriadoInvalidoError } from './errores.js';
import { DIAS_HABILES_MAXIMOS } from './tipos.js';

const DOMINGO = 0;
const SABADO = 6;
const LARGO_FECHA = 10;

/** No es domingo, no es sábado salvo que `sabadoHabil` lo sea, y no es feriado. */
export function esDiaHabil(fecha: string, feriados: ReadonlySet<string>, sabadoHabil: boolean): boolean {
  exigirFecha(fecha);
  const diaSemana = aFechaUtc(fecha).getUTCDay();
  if (diaSemana === DOMINGO) return false;
  if (diaSemana === SABADO && !sabadoHabil) return false;
  return !feriados.has(fecha);
}

/**
 * No cuenta `fecha`: avanza día por día y cuenta solo los hábiles hasta llegar a `dias` (TR-CA-075).
 * Con `dias = 0` devuelve `fecha` si es hábil y, si no, el siguiente hábil.
 */
export function sumarDiasHabiles(fecha: string, dias: number, feriados: ReadonlySet<string>, sabadoHabil: boolean): string {
  exigirDiasHabiles(dias);
  exigirFecha(fecha);
  if (dias === 0) return siguienteHabilDesde(fecha, feriados, sabadoHabil);
  let actual = fecha;
  let contados = 0;
  while (contados < dias) {
    actual = sumarDiasCalendario(actual, 1);
    if (esDiaHabil(actual, feriados, sabadoHabil)) contados += 1;
  }
  return actual;
}

export function exigirDiasHabiles(dias: number): void {
  if (!Number.isInteger(dias) || dias < 0 || dias > DIAS_HABILES_MAXIMOS) {
    throw new FeriadoInvalidoError('Los días hábiles deben estar entre 0 y 366');
  }
}

export function sumarDiasCalendario(fecha: string, dias: number): string {
  const resultado = aFechaUtc(fecha);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado.toISOString().slice(0, LARGO_FECHA);
}

export function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function siguienteHabilDesde(fecha: string, feriados: ReadonlySet<string>, sabadoHabil: boolean): string {
  let actual = fecha;
  while (!esDiaHabil(actual, feriados, sabadoHabil)) actual = sumarDiasCalendario(actual, 1);
  return actual;
}

function exigirFecha(fecha: string): void {
  if (!esFecha(fecha)) throw new FeriadoInvalidoError('La fecha no es válida');
}

function aFechaUtc(fecha: string): Date {
  return new Date(`${fecha}T00:00:00Z`);
}
