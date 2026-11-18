import type { Archivo } from '../domain/archivo.js';
import type { EstadoArchivo } from './ports/archivo.port.js';

/** Lo que ve quien consulta un archivo. Los campos que aún no existen se omiten, no van nulos. */
export function estadoDe(archivo: Archivo): EstadoArchivo {
  const { bytes, hashSha256 } = archivo.primeraVersion;
  return {
    archivoId: archivo.id,
    estado: archivo.estado,
    ...(archivo.motivoRechazo !== null && { motivoRechazo: archivo.motivoRechazo }),
    categoria: archivo.categoria,
    nombreOriginal: archivo.nombreOriginal,
    ...(bytes !== null && { bytes }),
    ...(hashSha256 !== null && { hashSha256 }),
  };
}
