import type { TonoEstado } from '@vitrina/shared/ui';

/** El valor por defecto de `plat.fe.dias_aviso_certificado`; la UI no lee el parámetro (spec 62). */
export const DIAS_AVISO_CERTIFICADO = 30;
const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` en Lima: en-CA formatea así. */
const FECHA_EN_LIMA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });

function diaEnLima(instante: Date): number {
  const [anio, mes, dia] = FECHA_EN_LIMA.format(instante).split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

/** Días de calendario de Lima entre hoy y el vencimiento; negativo si ya pasó el día. */
export function diasParaVencer(venceEn: string, hoy: Date): number {
  return Math.round((diaEnLima(new Date(venceEn)) - diaEnLima(hoy)) / MILISEGUNDOS_POR_DIA);
}

export function estaVencido(venceEn: string, hoy: Date): boolean {
  return new Date(venceEn).getTime() <= hoy.getTime();
}

/** Vencido, o vence en 30 días o menos. */
export function porVencer(venceEn: string, hoy: Date): boolean {
  return estaVencido(venceEn, hoy) || diasParaVencer(venceEn, hoy) <= DIAS_AVISO_CERTIFICADO;
}

export interface AvisoVencimiento {
  texto: string;
  tono: TonoEstado;
}

function textoDias(dias: number): string {
  if (dias === 0) return 'Vence hoy';
  return dias === 1 ? 'Vence en 1 día' : `Vence en ${dias} días`;
}

/** El chip de la lista y de la sección del certificado; null si falta más de 30 días. */
export function avisoVencimiento(venceEn: string, hoy: Date): AvisoVencimiento | null {
  if (estaVencido(venceEn, hoy)) return { texto: 'Vencido', tono: 'error' };
  const dias = diasParaVencer(venceEn, hoy);
  return dias <= DIAS_AVISO_CERTIFICADO ? { texto: textoDias(dias), tono: 'advertencia' } : null;
}
