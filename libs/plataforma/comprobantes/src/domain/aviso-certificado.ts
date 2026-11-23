import { diasEntre, fechaCalendarioDe, sumarDias, type FechaCalendario } from '@vitrina/plataforma/org';

/** Rango de `plat.fe.dias_aviso_certificado` y del CHECK de fe.aviso_certificado.dias_antes. */
export const DIAS_AVISO_MINIMO = 1;
export const DIAS_AVISO_MAXIMO = 90;
/** Lima no tiene horario de verano: su medianoche es siempre a las 05:00 UTC. */
const DESFASE_LIMA = '-05:00';

/** Un aviso por certificado (huella). `fechaEjecucion`: el día de Lima de la corrida que avisó. */
export interface AvisoCertificado {
  id: string;
  tenantId: string;
  emisorId: string;
  huellaSha256: string;
  diasAntes: number;
  venceEn: Date;
  fechaEjecucion: FechaCalendario;
}

/** Días de calendario de Lima desde `hoy` hasta el vencimiento; negativo si ya venció. */
export function diasRestantes(venceEn: Date, hoy: FechaCalendario): number {
  return diasEntre(hoy, fechaCalendarioDe(venceEn));
}

/** Faltan `diasAviso` días o menos, también si ya venció. */
export function debeAvisar(venceEn: Date, hoy: FechaCalendario, diasAviso: number): boolean {
  return diasRestantes(venceEn, hoy) <= diasAviso;
}

/**
 * Hasta dónde mira la tarea entre tenants: todo lo que vence hasta el día `hoy + 90` de Lima inclusive. Cada
 * tenant decide después con su propio parámetro.
 */
export function limiteDeRevision(hoy: FechaCalendario): Date {
  return new Date(`${sumarDias(hoy, DIAS_AVISO_MAXIMO + 1)}T00:00:00${DESFASE_LIMA}`);
}
