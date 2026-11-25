import type { VersionRegistrada } from '../../application/ports/repositorio-archivos.js';
import {
  Archivo,
  type CodigoEstadoArchivo,
  type CodigoEstadoVersion,
  type MotivoRechazo,
  type MotivoRechazoVersion,
  type OrigenArchivo,
  type RechazoVersion,
  type VersionArchivo,
} from '../../domain/archivo.js';
import { CategoriaArchivo } from '../../domain/categoria.js';
import type { FilaArchivo, FilaCategoria, FilaVersionArchivo } from './entidades.js';

type FilaArchivoNueva = Omit<FilaArchivo, 'creadoEn' | 'actualizadoEn'>;
type FilaVersionNueva = Omit<FilaVersionArchivo, 'subidoEn'>;
export type CambiosArchivo = Pick<
  FilaArchivo,
  'estado' | 'motivoRechazo' | 'versionVigente' | 'motivoRechazoVersion' | 'versionCoincidente'
>;
export type CambiosVersion = Pick<FilaVersionArchivo, 'estado' | 'hashSha256' | 'bytes' | 'mimeReal'>;

export function filaDesdeArchivo(archivo: Archivo): FilaArchivoNueva {
  return {
    id: archivo.id,
    tenantId: archivo.tenantId,
    categoria: archivo.categoria,
    entidadTipo: archivo.entidadTipo,
    entidadId: archivo.entidadId,
    nombreOriginal: archivo.nombreOriginal,
    ...cambiosDeArchivo(archivo),
    version: archivo.version,
    origen: archivo.origen,
    creadoPor: archivo.creadoPor,
  };
}

export function filaDesdeVersion(archivo: Archivo, version: Readonly<VersionArchivo>): FilaVersionNueva {
  return {
    archivoId: archivo.id,
    numero: version.numero,
    tenantId: archivo.tenantId,
    rutaStorage: version.rutaStorage,
    mimeDeclarado: version.mimeDeclarado,
    bytesDeclarados: String(version.bytesDeclarados),
    ...cambiosDeVersion(version),
    subidoPor: version.subidoPor,
  };
}

/** Lo único del archivo que cambia después de crearlo. */
export function cambiosDeArchivo(archivo: Archivo): CambiosArchivo {
  return {
    estado: archivo.estado,
    motivoRechazo: archivo.motivoRechazo,
    versionVigente: archivo.versionVigente,
    motivoRechazoVersion: archivo.rechazoVersion?.motivo ?? null,
    versionCoincidente: archivo.rechazoVersion?.versionCoincidente ?? null,
  };
}

/** Lo que el ciclo de la versión y su análisis cambian. */
export function cambiosDeVersion(version: Readonly<VersionArchivo>): CambiosVersion {
  return {
    estado: version.estado,
    hashSha256: version.hashSha256,
    bytes: version.bytes === null ? null : String(version.bytes),
    mimeReal: version.mimeReal,
  };
}

// Los CHECK de arc garantizan que cada texto pertenece a su lista del dominio.
export function archivoDesdeFilas(fila: FilaArchivo, versiones: FilaVersionArchivo[]): Archivo {
  return Archivo.reconstituir(fila.id, fila.version, {
    tenantId: fila.tenantId,
    categoria: fila.categoria,
    entidadTipo: fila.entidadTipo,
    entidadId: fila.entidadId,
    nombreOriginal: fila.nombreOriginal,
    estado: fila.estado as CodigoEstadoArchivo,
    motivoRechazo: fila.motivoRechazo as MotivoRechazo | null,
    versionVigente: fila.versionVigente,
    origen: fila.origen as OrigenArchivo,
    creadoPor: fila.creadoPor,
    versiones: versiones.map(versionDesdeFila),
    rechazoVersion: rechazoVersionDesdeFila(fila),
  });
}

export function versionRegistradaDesdeFila(fila: FilaVersionArchivo): VersionRegistrada {
  return { ...versionDesdeFila(fila), subidoEn: fila.subidoEn };
}

export function categoriaDesdeFila(fila: FilaCategoria): CategoriaArchivo {
  return new CategoriaArchivo(fila.codigo, fila.mimesPermitidos, Number(fila.tamanoMaxBytes), fila.sensible);
}

function versionDesdeFila(fila: FilaVersionArchivo): VersionArchivo {
  return {
    numero: fila.numero,
    rutaStorage: fila.rutaStorage,
    estado: fila.estado as CodigoEstadoVersion,
    mimeDeclarado: fila.mimeDeclarado,
    bytesDeclarados: Number(fila.bytesDeclarados),
    hashSha256: fila.hashSha256,
    bytes: fila.bytes === null ? null : Number(fila.bytes),
    mimeReal: fila.mimeReal,
    subidoPor: fila.subidoPor,
  };
}

function rechazoVersionDesdeFila(fila: FilaArchivo): RechazoVersion | null {
  if (fila.motivoRechazoVersion === null) return null;
  return { motivo: fila.motivoRechazoVersion as MotivoRechazoVersion, versionCoincidente: fila.versionCoincidente };
}
