import { EntitySchema } from 'typeorm';
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
  atributos: Record<string, unknown>;
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

/** Se registran en el DataSource de quien use la lib (apps/api). */
export const ENTIDADES_CAT = [CatalogoEntidad, ItemEntidad];
