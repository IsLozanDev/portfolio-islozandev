import { createHash } from 'node:crypto';
import { DISENOS_TABLAS, validarCabecera } from '../../domain/importacion/disenos-tablas.js';
import { ArchivoDemasiadoGrandeError, ArchivoInvalidoError } from '../../domain/importacion/errores.js';
import { TAMANO_MAXIMO_ARCHIVO, type TablaImportable } from '../../domain/importacion/tipos.js';
import { ValidacionArchivo } from '../../domain/importacion/validacion-archivo.js';
import type { LectorTabla, TipoArchivo } from '../ports/importacion.js';

const EXTENSIONES: Readonly<Record<string, TipoArchivo>> = { '.csv': 'CSV', '.xlsx': 'XLSX' };

export interface ArchivoImportado {
  nombre: string;
  contenido: Buffer;
}

/**
 * Valida tamaño, tipo y cabecera (sin guardar nada si fallan) y luego todas las filas, sin detenerse en
 * el primer error. El contenido real lo comprueba el lector: UTF-8 en CSV, firma ZIP en XLSX.
 */
export async function validarArchivo(lector: LectorTabla, tabla: TablaImportable, archivo: ArchivoImportado): Promise<ValidacionArchivo> {
  if (archivo.contenido.length > TAMANO_MAXIMO_ARCHIVO) throw new ArchivoDemasiadoGrandeError();
  const leida = await lector.leer(archivo.contenido, tipoDe(archivo.nombre));
  const diseno = DISENOS_TABLAS[tabla];
  validarCabecera(diseno, leida.cabecera);
  const validacion = new ValidacionArchivo(diseno);
  for await (const fila of leida.filas) validacion.agregar(fila.numero, fila.celdas);
  return validacion;
}

export function sha256De(contenido: Buffer): string {
  return createHash('sha256').update(contenido).digest('hex');
}

/** Por extensión: el MIME que manda el navegador para un .csv varía (en Windows, application/vnd.ms-excel). */
function tipoDe(nombre: string): TipoArchivo {
  const extension = nombre.slice(nombre.lastIndexOf('.')).toLowerCase();
  const tipo = EXTENSIONES[extension];
  if (!tipo) throw new ArchivoInvalidoError('Solo se aceptan archivos CSV o XLSX');
  return tipo;
}
