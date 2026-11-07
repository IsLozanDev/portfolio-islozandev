import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import type { TablaLeida } from '../../application/ports/importacion.js';
import { ArchivoInvalidoError } from '../../domain/importacion/errores.js';
import { tablaDesde, type FilaCruda } from './filas-de-tabla.js';

/** Un XLSX es un ZIP. */
const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PRIMERA_COLUMNA = 1;

/** Primera hoja en streaming, con la primera fila como cabecera y las celdas leídas como texto. */
export class LectorXlsx {
  leer(archivo: Buffer): Promise<TablaLeida> {
    if (!archivo.subarray(0, FIRMA_ZIP.length).equals(FIRMA_ZIP)) {
      throw new ArchivoInvalidoError('Solo se aceptan archivos CSV o XLSX');
    }
    return tablaDesde(filasDePrimeraHoja(archivo));
  }
}

async function* filasDePrimeraHoja(archivo: Buffer): AsyncGenerator<FilaCruda> {
  const libro = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(archivo), {
    entries: 'ignore',
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
  });
  // exceljs 4.4.0 lee `model.sheets` al abrir una hoja que en el ZIP va antes de xl/workbook.xml (así
  // escribe exceljs) y falla si model aún no existe. xl/workbook.xml lo reemplaza al llegar.
  Object.assign(libro, { model: { sheets: [] } });
  try {
    for await (const hoja of libro) {
      for await (const fila of hoja) yield { numero: fila.number, valores: textosDe(fila) };
      return;
    }
  } catch (error) {
    if (error instanceof ArchivoInvalidoError) throw error;
    throw new ArchivoInvalidoError('El archivo XLSX no es válido');
  }
}

function textosDe(fila: ExcelJS.Row): string[] {
  return Array.from({ length: fila.cellCount }, (_, posicion) => fila.getCell(posicion + PRIMERA_COLUMNA).text);
}
