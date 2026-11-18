import { Archivo, type EstadoArchivo, type MotivoRechazo, type VersionArchivo } from '../../domain/archivo.js';
import { CategoriaArchivo } from '../../domain/categoria.js';
import type { FilaArchivo, FilaCategoria, FilaVersionArchivo } from './entidades.js';

type FilaArchivoNueva = Omit<FilaArchivo, 'creadoEn' | 'actualizadoEn'>;
type FilaVersionNueva = Omit<FilaVersionArchivo, 'subidoEn'>;
export type CambiosArchivo = Pick<FilaArchivo, 'estado' | 'motivoRechazo' | 'versionVigente'>;
export type CambiosVersion = Pick<FilaVersionArchivo, 'hashSha256' | 'bytes' | 'mimeReal'>;

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
    creadoPor: archivo.creadoPor,
  };
}

export function filaDesdeVersion(archivo: Archivo): FilaVersionNueva {
  const version = archivo.primeraVersion;
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
  return { estado: archivo.estado, motivoRechazo: archivo.motivoRechazo, versionVigente: archivo.versionVigente };
}

/** Lo que el análisis llena en la versión. */
export function cambiosDeVersion(version: Readonly<VersionArchivo>): CambiosVersion {
  return {
    hashSha256: version.hashSha256,
    bytes: version.bytes === null ? null : String(version.bytes),
    mimeReal: version.mimeReal,
  };
}

// Los CHECK de arc garantizan que cada texto pertenece a su lista del dominio.
export function archivoDesdeFilas(fila: FilaArchivo, version: FilaVersionArchivo): Archivo {
  return Archivo.reconstituir(fila.id, fila.version, {
    tenantId: fila.tenantId,
    categoria: fila.categoria,
    entidadTipo: fila.entidadTipo,
    entidadId: fila.entidadId,
    nombreOriginal: fila.nombreOriginal,
    estado: fila.estado as EstadoArchivo,
    motivoRechazo: fila.motivoRechazo as MotivoRechazo | null,
    versionVigente: fila.versionVigente,
    creadoPor: fila.creadoPor,
    primeraVersion: {
      numero: version.numero,
      rutaStorage: version.rutaStorage,
      mimeDeclarado: version.mimeDeclarado,
      bytesDeclarados: Number(version.bytesDeclarados),
      hashSha256: version.hashSha256,
      bytes: version.bytes === null ? null : Number(version.bytes),
      mimeReal: version.mimeReal,
      subidoPor: version.subidoPor,
    },
  });
}

export function categoriaDesdeFila(fila: FilaCategoria): CategoriaArchivo {
  return new CategoriaArchivo(fila.codigo, fila.mimesPermitidos, Number(fila.tamanoMaxBytes), fila.sensible);
}
