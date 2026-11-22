import type { Categoria } from '../models/categoria';
import { formatoBytes } from './formato-bytes';

export type MotivoArchivoInvalido = 'MIME' | 'TAMANO' | 'VACIO';

export interface ArchivoInvalido {
  motivo: MotivoArchivoInvalido;
  mensaje: string;
}

export const MENSAJES_VALIDACION_ARCHIVO = {
  vacio: 'El archivo está vacío',
  mime: 'Tipo de archivo no permitido',
  tamano: (maximo: string) => `El archivo supera el máximo de ${maximo}`,
} as const;

/** Lo que el front puede saber antes de subir. El análisis vuelve a revisar el tipo real y el tamaño. */
export function validarArchivo(archivo: File, categoria: Categoria): ArchivoInvalido | null {
  if (archivo.size === 0) return { motivo: 'VACIO', mensaje: MENSAJES_VALIDACION_ARCHIVO.vacio };
  if (!categoria.mimesPermitidos.includes(archivo.type)) return { motivo: 'MIME', mensaje: MENSAJES_VALIDACION_ARCHIVO.mime };
  if (archivo.size > categoria.tamanoMaxBytes) {
    return { motivo: 'TAMANO', mensaje: MENSAJES_VALIDACION_ARCHIVO.tamano(formatoBytes(categoria.tamanoMaxBytes)) };
  }
  return null;
}
