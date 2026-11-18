export const AGREGADO_ARCHIVO = 'archivo';
export const VERSION_ESQUEMA_ARC = 1;

/** Eventos de archivos en el outbox, en schema_version 1. `archivo.en_cuarentena` es un añadido al SRS. */
export const EVENTOS_ARC = {
  disponible: 'archivo.disponible',
  enCuarentena: 'archivo.en_cuarentena',
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

export interface ArchivoEnCuarentena {
  archivo_id: string;
  categoria: string;
  entidad_tipo: string;
  entidad_id: string;
  firma: string;
}
