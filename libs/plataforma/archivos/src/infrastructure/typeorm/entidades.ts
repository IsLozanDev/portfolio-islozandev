import { EntitySchema } from 'typeorm';

// Mapeo ORM de las tablas de arc. El esquema lo definen las migraciones de db/ (sin synchronize):
// aquí solo se describe lo que ya existe.

export interface FilaCategoria {
  codigo: string;
  mimesPermitidos: string[];
  /** `bigint`: el driver lo entrega como texto. */
  tamanoMaxBytes: string;
  sensible: boolean;
}

export interface FilaArchivo {
  id: string;
  tenantId: string;
  categoria: string;
  entidadTipo: string;
  entidadId: string;
  nombreOriginal: string;
  estado: string;
  motivoRechazo: string | null;
  motivoRechazoVersion: string | null;
  versionCoincidente: number | null;
  versionVigente: number | null;
  version: number;
  creadoPor: string;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface FilaVersionArchivo {
  archivoId: string;
  numero: number;
  tenantId: string;
  rutaStorage: string;
  estado: string;
  mimeDeclarado: string;
  /** `bigint`: el driver lo entrega como texto. */
  bytesDeclarados: string;
  hashSha256: string | null;
  bytes: string | null;
  mimeReal: string | null;
  subidoPor: string;
  subidoEn: Date;
}

export const CategoriaEntidad = new EntitySchema<FilaCategoria>({
  name: 'CategoriaArchivo',
  schema: 'arc',
  tableName: 'categoria',
  columns: {
    codigo: { type: 'varchar', length: 20, primary: true },
    mimesPermitidos: { name: 'mimes_permitidos', type: 'text', array: true },
    tamanoMaxBytes: { name: 'tamano_max_bytes', type: 'bigint' },
    sensible: { type: 'boolean' },
  },
});

export const ArchivoEntidad = new EntitySchema<FilaArchivo>({
  name: 'Archivo',
  schema: 'arc',
  tableName: 'archivo',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    categoria: { type: 'varchar', length: 20 },
    entidadTipo: { name: 'entidad_tipo', type: 'varchar', length: 40 },
    entidadId: { name: 'entidad_id', type: 'varchar', length: 80 },
    nombreOriginal: { name: 'nombre_original', type: 'varchar', length: 255 },
    estado: { type: 'varchar', length: 16 },
    motivoRechazo: { name: 'motivo_rechazo', type: 'varchar', length: 20, nullable: true },
    motivoRechazoVersion: { name: 'motivo_rechazo_version', type: 'varchar', length: 20, nullable: true },
    versionCoincidente: { name: 'version_coincidente', type: 'integer', nullable: true },
    versionVigente: { name: 'version_vigente', type: 'integer', nullable: true },
    // TypeORM la sube en uno en cada UPDATE: también en los cambios de estado que no publican evento.
    version: { type: 'integer', version: true },
    creadoPor: { name: 'creado_por', type: 'uuid' },
    creadoEn: { name: 'creado_en', type: 'timestamptz', createDate: true },
    actualizadoEn: { name: 'actualizado_en', type: 'timestamptz', updateDate: true },
  },
});

export const VersionArchivoEntidad = new EntitySchema<FilaVersionArchivo>({
  name: 'VersionArchivo',
  schema: 'arc',
  tableName: 'version_archivo',
  columns: {
    archivoId: { name: 'archivo_id', type: 'uuid', primary: true },
    numero: { type: 'integer', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    rutaStorage: { name: 'ruta_storage', type: 'varchar', length: 120 },
    estado: { type: 'varchar', length: 16 },
    mimeDeclarado: { name: 'mime_declarado', type: 'varchar', length: 100 },
    bytesDeclarados: { name: 'bytes_declarados', type: 'bigint' },
    hashSha256: { name: 'hash_sha256', type: 'char', length: 64, nullable: true },
    bytes: { type: 'bigint', nullable: true },
    mimeReal: { name: 'mime_real', type: 'varchar', length: 100, nullable: true },
    subidoPor: { name: 'subido_por', type: 'uuid' },
    subidoEn: { name: 'subido_en', type: 'timestamptz', createDate: true },
  },
});

export const ENTIDADES_ARC = [CategoriaEntidad, ArchivoEntidad, VersionArchivoEntidad];
