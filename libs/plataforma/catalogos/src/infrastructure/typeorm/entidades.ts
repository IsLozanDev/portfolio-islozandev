import { EntitySchema } from 'typeorm';
import type { ErrorFila, EstadoImportacion } from '../../domain/importacion/tipos.js';
import type { AlcanceFeriado } from '../../domain/feriados/tipos.js';
import type { AlcanceCatalogo } from '../../domain/tipos.js';

// Mapeo ORM de las tablas de cat. El esquema lo definen las migraciones de db/ (sin synchronize):
// aquí solo se describe lo que ya existe.

export interface FilaCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  alcance: AlcanceCatalogo;
  fuente: string | null;
  editablePorTenant: boolean;
  /** bigint: node-pg lo devuelve como string. */
  version: string;
  creadoPor: string | null;
  creadoEn: Date;
  modificadoPor: string | null;
  modificadoEn: Date;
}

export interface FilaItem {
  id: string;
  catalogoId: string;
  tenantId: string | null;
  codigo: string;
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  /** Objeto JSON: lo exige el CHECK de la tabla. */
  atributos: object;
  /** date: TypeORM lo hidrata como YYYY-MM-DD. */
  vigenteDesde: string;
  vigenteHasta: string | null;
  activo: boolean;
  /** bigint: node-pg lo devuelve como string. */
  version: string;
  creadoPor: string | null;
  creadoEn: Date;
  modificadoPor: string | null;
  modificadoEn: Date;
}

// La app solo lee cat.catalogo: lo escriben las funciones SECURITY DEFINER.
export const CatalogoEntidad = new EntitySchema<FilaCatalogo>({
  name: 'Catalogo',
  schema: 'cat',
  tableName: 'catalogo',
  columns: {
    id: { type: 'uuid', primary: true },
    codigo: { type: 'varchar', length: 60 },
    nombre: { type: 'varchar', length: 150 },
    alcance: { type: 'varchar', length: 6 },
    fuente: { type: 'varchar', length: 150, nullable: true },
    editablePorTenant: { name: 'editable_por_tenant', type: 'boolean' },
    version: { type: 'bigint' },
    creadoPor: { name: 'creado_por', type: 'uuid', nullable: true },
    creadoEn: { name: 'creado_en', type: 'timestamptz' },
    modificadoPor: { name: 'modificado_por', type: 'uuid', nullable: true },
    modificadoEn: { name: 'modificado_en', type: 'timestamptz' },
  },
});

export const ItemEntidad = new EntitySchema<FilaItem>({
  name: 'ItemCatalogo',
  schema: 'cat',
  tableName: 'catalogo_item',
  columns: {
    id: { type: 'uuid', primary: true },
    catalogoId: { name: 'catalogo_id', type: 'uuid', update: false },
    tenantId: { name: 'tenant_id', type: 'uuid', nullable: true, update: false },
    codigo: { type: 'varchar', length: 40, update: false },
    codigoExterno: { name: 'codigo_externo', type: 'varchar', length: 40, nullable: true },
    nombre: { type: 'varchar', length: 200 },
    abreviatura: { type: 'varchar', length: 30, nullable: true },
    orden: { type: 'integer' },
    atributos: { type: 'jsonb' },
    vigenteDesde: { name: 'vigente_desde', type: 'date' },
    vigenteHasta: { name: 'vigente_hasta', type: 'date', nullable: true },
    activo: { type: 'boolean' },
    // Bloqueo optimista propio (WHERE version = previa): la versión la lleva el agregado, no TypeORM.
    version: { type: 'bigint' },
    creadoPor: { name: 'creado_por', type: 'uuid', nullable: true, update: false },
    creadoEn: { name: 'creado_en', type: 'timestamptz', update: false },
    modificadoPor: { name: 'modificado_por', type: 'uuid', nullable: true },
    modificadoEn: { name: 'modificado_en', type: 'timestamptz' },
  },
});

export interface FilaAjuste {
  itemId: string;
  tenantId: string;
  visible: boolean;
  orden: number | null;
  alias: string | null;
  /** bigint: node-pg lo devuelve como string. */
  version: string;
  modificadoPor: string;
  modificadoEn: Date;
}

export const AjusteEntidad = new EntitySchema<FilaAjuste>({
  name: 'AjusteItem',
  schema: 'cat',
  tableName: 'catalogo_item_tenant',
  columns: {
    itemId: { name: 'item_id', type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid', primary: true },
    visible: { type: 'boolean' },
    orden: { type: 'integer', nullable: true },
    alias: { type: 'varchar', length: 200, nullable: true },
    version: { type: 'bigint' },
    modificadoPor: { name: 'modificado_por', type: 'uuid' },
    modificadoEn: { name: 'modificado_en', type: 'timestamptz' },
  },
});

export interface FilaImportacion {
  id: string;
  tenantId: string;
  catalogoId: string;
  versionOficial: string;
  /** date: TypeORM lo hidrata como YYYY-MM-DD. */
  fechaVigencia: string;
  archivoNombre: string;
  archivoSha256: string;
  /** bigint: node-pg lo devuelve como string. */
  versionCatalogo: string;
  estado: EstadoImportacion;
  altas: number;
  cambios: number;
  bajas: number;
  sinCambios: number;
  /** El formato que leen las funciones de aplicación (snake_case). */
  operaciones: OperacionesJson | null;
  totalErrores: number;
  errores: ErrorFila[] | null;
  motivoFallo: string | null;
  lanzadoPor: string;
  creadoEn: Date;
  encoladoEn: Date | null;
  aplicadoPor: string | null;
  terminadoEn: Date | null;
  /** bigint: node-pg lo devuelve como string. */
  version: string;
}

export interface FilaOperacionJson {
  numero: number;
  codigo: string;
  codigo_externo: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: Record<string, string>;
}

export interface OperacionesJson {
  altas: FilaOperacionJson[];
  cambios: (FilaOperacionJson & { item_id: string })[];
  bajas: string[];
}

export const ImportacionEntidad = new EntitySchema<FilaImportacion>({
  name: 'Importacion',
  schema: 'cat',
  tableName: 'importacion',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid', update: false },
    catalogoId: { name: 'catalogo_id', type: 'uuid', update: false },
    versionOficial: { name: 'version_oficial', type: 'varchar', length: 40, update: false },
    fechaVigencia: { name: 'fecha_vigencia', type: 'date', update: false },
    archivoNombre: { name: 'archivo_nombre', type: 'varchar', length: 200, update: false },
    archivoSha256: { name: 'archivo_sha256', type: 'char', length: 64, update: false },
    versionCatalogo: { name: 'version_catalogo', type: 'bigint', update: false },
    estado: { type: 'varchar', length: 14 },
    altas: { type: 'integer', update: false },
    cambios: { type: 'integer', update: false },
    bajas: { type: 'integer', update: false },
    sinCambios: { name: 'sin_cambios', type: 'integer', update: false },
    operaciones: { type: 'jsonb', nullable: true },
    totalErrores: { name: 'total_errores', type: 'integer', update: false },
    errores: { type: 'jsonb', nullable: true },
    motivoFallo: { name: 'motivo_fallo', type: 'varchar', length: 300, nullable: true },
    lanzadoPor: { name: 'lanzado_por', type: 'uuid', update: false },
    creadoEn: { name: 'creado_en', type: 'timestamptz', update: false },
    encoladoEn: { name: 'encolado_en', type: 'timestamptz', nullable: true },
    aplicadoPor: { name: 'aplicado_por', type: 'uuid', nullable: true },
    terminadoEn: { name: 'terminado_en', type: 'timestamptz', nullable: true },
    // Bloqueo optimista propio (WHERE version = previa), como en los ítems.
    version: { type: 'bigint' },
  },
});

export interface FilaFeriado {
  id: string;
  alcance: AlcanceFeriado;
  tenantId: string | null;
  sucursalId: string | null;
  /** date: TypeORM lo hidrata como YYYY-MM-DD. */
  fecha: string;
  nombre: string;
  recurrenteAnual: boolean;
  /** bigint: node-pg lo devuelve como string. */
  version: string;
  creadoPor: string | null;
  creadoEn: Date;
  modificadoPor: string | null;
  modificadoEn: Date;
}

// La app escribe con esta entidad solo los del tenant: los globales van por funciones SECURITY DEFINER.
export const FeriadoEntidad = new EntitySchema<FilaFeriado>({
  name: 'Feriado',
  schema: 'cat',
  tableName: 'feriado',
  columns: {
    id: { type: 'uuid', primary: true },
    alcance: { type: 'varchar', length: 8, update: false },
    tenantId: { name: 'tenant_id', type: 'uuid', nullable: true, update: false },
    sucursalId: { name: 'sucursal_id', type: 'uuid', nullable: true, update: false },
    fecha: { type: 'date' },
    nombre: { type: 'varchar', length: 100 },
    recurrenteAnual: { name: 'recurrente_anual', type: 'boolean' },
    // Bloqueo optimista propio (WHERE version = previa), como en los ítems.
    version: { type: 'bigint' },
    creadoPor: { name: 'creado_por', type: 'uuid', nullable: true, update: false },
    creadoEn: { name: 'creado_en', type: 'timestamptz', update: false },
    modificadoPor: { name: 'modificado_por', type: 'uuid', nullable: true },
    modificadoEn: { name: 'modificado_en', type: 'timestamptz' },
  },
});

/** Se registran en el DataSource de quien use la lib (apps/api). */
export const ENTIDADES_CAT = [CatalogoEntidad, ItemEntidad, AjusteEntidad, ImportacionEntidad, FeriadoEntidad];
