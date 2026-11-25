import { TotalNoCoincideError } from '../errores.js';
import { Decimal, ESCALA_MONTO, monto } from './dinero.js';
import type { GrupoAfectacion, LineaCalculada } from './linea-comprobante.js';

/** TR-RN-021: diferencia admitida entre el total calculado y el que envía el llamador. */
export const TOLERANCIA_SOLES = monto('0.01', 'tolerancia');

export interface Totales {
  gravado: Decimal;
  exonerado: Decimal;
  inafecto: Decimal;
  igv: Decimal;
  total: Decimal;
}

const TOTAL_DEL_GRUPO: Record<GrupoAfectacion, keyof Pick<Totales, 'gravado' | 'exonerado' | 'inafecto'>> = {
  GRAVADO: 'gravado',
  EXONERADO: 'exonerado',
  INAFECTO: 'inafecto',
};

/** Suma de los valores ya redondeados por línea: el total coincide con lo que se imprime. */
export function calcularTotales(lineas: readonly LineaCalculada[]): Totales {
  const cero = Decimal.cero(ESCALA_MONTO);
  const totales = { gravado: cero, exonerado: cero, inafecto: cero, igv: cero };
  for (const linea of lineas) {
    const grupo = TOTAL_DEL_GRUPO[linea.grupo];
    totales[grupo] = totales[grupo].sumar(linea.valorVenta);
    totales.igv = totales.igv.sumar(linea.igv);
  }
  return { ...totales, total: totales.gravado.sumar(totales.exonerado).sumar(totales.inafecto).sumar(totales.igv) };
}

/** Dentro de la tolerancia se emite con el calculado; fuera, 422. */
export function verificarTotalEsperado(total: Decimal, esperado: Decimal | null): void {
  if (esperado === null) return;
  if (total.restar(esperado).valorAbsoluto().esMayorQue(TOLERANCIA_SOLES)) {
    throw new TotalNoCoincideError(total.aTexto(), esperado.aTexto());
  }
}
