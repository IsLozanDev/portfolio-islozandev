import { NUMERO_PRIMERA_VERSION, type Archivo, type RechazoVersion } from '../domain/archivo.js';
import { mensajeRechazoVersion } from '../domain/mensaje-rechazo-version.js';
import type { EstadoArchivo, RechazoVersionVisible, VersionListada } from './ports/archivo.port.js';
import type { VersionRegistrada } from './ports/repositorio-archivos.js';

/**
 * Lo que ve quien consulta un archivo. Los campos que aún no existen se omiten, no van nulos. `bytes` y
 * `hashSha256` son los de la versión vigente; sin vigente, los de la versión 1.
 */
export function estadoDe(archivo: Archivo): EstadoArchivo {
  const mostrada = archivo.versionNumero(archivo.versionVigente ?? NUMERO_PRIMERA_VERSION) ?? archivo.primeraVersion;
  const { bytes, hashSha256 } = mostrada;
  const enCurso = archivo.versionEnCurso;
  return {
    archivoId: archivo.id,
    estado: archivo.estado,
    ...(archivo.motivoRechazo !== null && { motivoRechazo: archivo.motivoRechazo }),
    categoria: archivo.categoria,
    entidadTipo: archivo.entidadTipo,
    entidadId: archivo.entidadId,
    nombreOriginal: archivo.nombreOriginal,
    ...(bytes !== null && { bytes }),
    ...(hashSha256 !== null && { hashSha256 }),
    ...(archivo.versionVigente !== null && { versionVigente: archivo.versionVigente }),
    ...(enCurso && { versionEnCurso: { numero: enCurso.numero, estado: enCurso.estado } }),
    ...(archivo.rechazoVersion && { rechazoVersion: rechazoVisibleDe(archivo.rechazoVersion, archivo.versionVigente) }),
  };
}

/** Una versión de la lista. Los datos del análisis se omiten mientras no existen. */
export function versionListadaDe(version: VersionRegistrada, versionVigente: number | null): VersionListada {
  return {
    numero: version.numero,
    estado: version.estado,
    vigente: version.numero === versionVigente,
    ...(version.hashSha256 !== null && { hashSha256: version.hashSha256 }),
    ...(version.bytes !== null && { bytes: version.bytes }),
    ...(version.mimeReal !== null && { mimeReal: version.mimeReal }),
    subidoPor: version.subidoPor,
    subidoEn: version.subidoEn,
  };
}

function rechazoVisibleDe(rechazo: RechazoVersion, versionVigente: number | null): RechazoVersionVisible {
  return {
    motivo: rechazo.motivo,
    ...(rechazo.versionCoincidente !== null && { versionCoincidente: rechazo.versionCoincidente }),
    mensaje: mensajeRechazoVersion(rechazo, versionVigente),
  };
}
