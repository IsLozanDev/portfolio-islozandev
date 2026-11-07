import { CsvError, parse } from 'csv-parse';
import type { TablaLeida } from '../../application/ports/importacion.js';
import { ArchivoInvalidoError } from '../../domain/importacion/errores.js';
import { tablaDesde, type FilaCruda } from './filas-de-tabla.js';

const COMA = ',';
const PUNTO_Y_COMA = ';';
/** La cabecera es la fila 1. */
const PRIMERA_FILA = 1;

/** CSV en UTF-8 estricto, con BOM opcional y separador `,` o `;` detectado en la cabecera. */
export class LectorCsv {
  leer(archivo: Buffer): Promise<TablaLeida> {
    const texto = decodificarUtf8(archivo);
    const parser = parse(texto, { delimiter: separadorDe(texto), relax_column_count: true });
    return tablaDesde(filasCrudas(parser));
  }
}

/** `TextDecoder` quita el BOM. `fatal`: un byte que no es UTF-8 (Latin-1, por ejemplo) falla. */
function decodificarUtf8(archivo: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(archivo);
  } catch {
    throw new ArchivoInvalidoError('El archivo no está en UTF-8');
  }
}

function separadorDe(texto: string): string {
  const cabecera = texto.slice(0, texto.search(/\r?\n|$/));
  return contar(cabecera, PUNTO_Y_COMA) > contar(cabecera, COMA) ? PUNTO_Y_COMA : COMA;
}

function contar(texto: string, caracter: string): number {
  return texto.split(caracter).length - 1;
}

/** El error de csv-parse trae la línea donde falló (`lines`); puede llegar antes de emitir las filas previas. */
async function* filasCrudas(registros: AsyncIterable<string[]>): AsyncGenerator<FilaCruda> {
  let numero = PRIMERA_FILA;
  try {
    for await (const valores of registros) yield { numero: numero++, valores };
  } catch (error) {
    if (error instanceof CsvError) throw new ArchivoInvalidoError(`El CSV no es válido en la fila ${String(error['lines'])}`);
    throw error;
  }
}
