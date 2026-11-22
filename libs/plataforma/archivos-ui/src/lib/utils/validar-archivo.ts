import type { Categoria } from '../models/categoria';
import { formatoBytes } from './formato-bytes';
import { tiposPermitidos } from './tipos-archivo';

export type MotivoArchivoInvalido = 'MIME' | 'TAMANO' | 'VACIO';

export interface ArchivoInvalido {
  motivo: MotivoArchivoInvalido;
  mensaje: string;
}

export const MENSAJES_VALIDACION_ARCHIVO = {
  vacio: (nombre: string) => `El archivo «${nombre}» está vacío.`,
  mime: (nombre: string, tipos: string) => `Tipo de archivo no permitido: «${nombre}». Solo ${tipos}.`,
  tamano: (nombre: string, maximo: string) => `El archivo «${nombre}» supera el máximo de ${maximo}.`,
} as const;

/** Lo que el front puede saber antes de subir. El análisis vuelve a revisar el tipo real y el tamaño. */
export function validarArchivo(archivo: File, categoria: Categoria): ArchivoInvalido | null {
  if (archivo.size === 0) return { motivo: 'VACIO', mensaje: MENSAJES_VALIDACION_ARCHIVO.vacio(archivo.name) };
  if (!categoria.mimesPermitidos.includes(archivo.type)) {
    return { motivo: 'MIME', mensaje: MENSAJES_VALIDACION_ARCHIVO.mime(archivo.name, tiposPermitidos(categoria)) };
  }
  if (archivo.size > categoria.tamanoMaxBytes) {
    return { motivo: 'TAMANO', mensaje: MENSAJES_VALIDACION_ARCHIVO.tamano(archivo.name, formatoBytes(categoria.tamanoMaxBytes)) };
  }
  return null;
}
