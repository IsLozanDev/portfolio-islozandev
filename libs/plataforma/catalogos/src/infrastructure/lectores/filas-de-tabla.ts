import type { FilaLeida, TablaLeida } from '../../application/ports/importacion.js';
import { ArchivoInvalidoError } from '../../domain/importacion/errores.js';
import { FILAS_MAXIMAS } from '../../domain/importacion/tipos.js';

/** Fila cruda: número de fila del archivo y valores por posición. */
export interface FilaCruda {
  numero: number;
  valores: string[];
}

/**
 * Toma la primera fila como cabecera y deja el resto en streaming. Salta las filas vacías, faltantes
 * quedan en '' y falla si no hay filas de datos o pasan de FILAS_MAXIMAS.
 */
export async function tablaDesde(filas: AsyncIterable<FilaCruda>): Promise<TablaLeida> {
  const iterador = filas[Symbol.asyncIterator]();
  const primera = await iterador.next();
  if (primera.done) throw new ArchivoInvalidoError('El archivo está vacío');
  const cabecera = primera.value.valores;
  return { cabecera, filas: filasDeDatos(iterador, cabecera) };
}

async function* filasDeDatos(iterador: AsyncIterator<FilaCruda>, cabecera: string[]): AsyncGenerator<FilaLeida> {
  let leidas = 0;
  for (let siguiente = await iterador.next(); !siguiente.done; siguiente = await iterador.next()) {
    const { numero, valores } = siguiente.value;
    if (valores.every((valor) => valor.trim() === '')) continue;
    leidas += 1;
    if (leidas > FILAS_MAXIMAS) throw new ArchivoInvalidoError('El archivo supera las 50 000 filas');
    yield { numero, celdas: Object.fromEntries(cabecera.map((columna, posicion) => [columna, valores[posicion] ?? ''])) };
  }
  if (leidas === 0) throw new ArchivoInvalidoError('El archivo no tiene filas');
}
