import type { ErrorFila } from '../../domain/importacion/tipos.js';

const BOM = '﻿';
/** El que espera Excel en español. */
const SEPARADOR = ';';
const FIN_DE_LINEA = '\r\n';
const CABECERA = ['fila', 'columna', 'valor', 'mensaje'];
const REQUIERE_COMILLAS = /[;"\r\n]/;
/** Un valor que empieza así lo evalúa Excel como fórmula (inyección en CSV, OWASP). */
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Reporte de errores en CSV, línea por línea: BOM UTF-8 para que Excel muestre tildes y ñ, separador `;`,
 * ordenado por fila. Si se guardaron menos de los que hubo, la última línea lo dice.
 */
export function* lineasReporteErrores(errores: readonly ErrorFila[], totalErrores: number): Generator<string> {
  yield BOM + linea(CABECERA);
  const porFila = [...errores].sort((uno, otro) => uno.fila - otro.fila);
  for (const error of porFila) yield linea([String(error.fila), error.columna, neutralizarFormula(error.valor), error.mensaje]);
  if (totalErrores > errores.length) yield linea([`Se muestran ${conMiles(errores.length)} de ${conMiles(totalErrores)} errores`]);
}

function linea(campos: readonly string[]): string {
  return campos.map(campoCsv).join(SEPARADOR) + FIN_DE_LINEA;
}

function campoCsv(valor: string): string {
  return REQUIERE_COMILLAS.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor;
}

function neutralizarFormula(valor: string): string {
  return INICIO_DE_FORMULA.test(valor) ? `'${valor}` : valor;
}

/** 12000 -> «12 000». */
function conMiles(numero: number): string {
  return String(numero).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
