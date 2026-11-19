export const AGREGADO_ARCHIVO = 'archivo';
export const VERSION_ESQUEMA_ARC = 1;

/**
 * Eventos de archivos en el outbox, en schema_version 1. `archivo.en_cuarentena`, `archivo.version_creada` y
 * `archivo.version_vigente_cambiada` son añadidos al SRS. `archivo.disponible` es solo la primera disponibilidad.
 */
export const EVENTOS_ARC = {
  disponible: 'archivo.disponible',
  enCuarentena: 'archivo.en_cuarentena',
  versionCreada: 'archivo.version_creada',
  versionVigenteCambiada: 'archivo.version_vigente_cambiada',
} as const;

/** Sin `nombre_original` (puede llevar datos personales): los consumidores leen el archivo por `ArchivoPort`. */
export interface ArchivoDisponible {
  archivo_id: string;
  categoria: string;
  entidad_tipo: string;
  entidad_id: string;
  version: number;
  hash_sha256: string;
  bytes: number;
  mime_real: string;
}

/** `version`: la versión en cuarentena (1 si es la primera carga). */
export interface ArchivoEnCuarentena {
  archivo_id: string;
  categoria: string;
  entidad_tipo: string;
  entidad_id: string;
  version: number;
  firma: string;
}

/** Una versión nueva aprobada, que pasa a ser la vigente. */
export type ArchivoVersionCreada = ArchivoDisponible;

export interface ArchivoVersionVigenteCambiada {
  archivo_id: string;
  categoria: string;
  entidad_tipo: string;
  entidad_id: string;
  version_anterior: number;
  version_vigente: number;
}
