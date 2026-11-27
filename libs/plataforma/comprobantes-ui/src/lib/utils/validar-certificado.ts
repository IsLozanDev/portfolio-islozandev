import { CODIGOS_ERROR_FE } from '../models/mensajes-emisor';

export const BYTES_POR_KB = 1024;
const KB_MAXIMOS_CERTIFICADO = 50;
/** El mismo límite que la API (spec 49): se rechaza antes de subir. */
export const TAMANO_MAXIMO_CERTIFICADO_BYTES = KB_MAXIMOS_CERTIFICADO * BYTES_POR_KB;
export const EXTENSIONES_CERTIFICADO = ['.pfx', '.p12'] as const;

export type ErrorArchivoCertificado = typeof CODIGOS_ERROR_FE.archivoCertificadoInvalido | typeof CODIGOS_ERROR_FE.archivoDemasiadoGrande;

function tieneExtensionDeCertificado(nombre: string): boolean {
  const nombreEnMinusculas = nombre.toLowerCase();
  return EXTENSIONES_CERTIFICADO.some((extension) => nombreEnMinusculas.endsWith(extension));
}

/** El código de error con su mensaje en `MENSAJES_ERROR_FE`, o null si el archivo se puede subir. */
export function validarArchivoCertificado(archivo: Pick<File, 'name' | 'size'>): ErrorArchivoCertificado | null {
  if (!tieneExtensionDeCertificado(archivo.name)) return CODIGOS_ERROR_FE.archivoCertificadoInvalido;
  if (archivo.size > TAMANO_MAXIMO_CERTIFICADO_BYTES) return CODIGOS_ERROR_FE.archivoDemasiadoGrande;
  return null;
}
