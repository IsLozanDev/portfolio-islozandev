import { EntitySchema } from 'typeorm';
import type { AlcanceParametro, TipoParametro } from '../../domain/tipos.js';
import type { ResumenDefiniciones } from '../../application/ports/repositorios.js';
import { EmpresaNombreEntidad, SucursalNombreEntidad } from './entidades-org.js';

// Mapeo ORM de las tablas de cfg. El esquema lo definen las migraciones de db/ (sin synchronize):
// aquí solo se describe lo que ya existe.

/** Lo que cabe en una columna jsonb no nula. */
export type ValorJson = string | number | boolean | object;

export interface FilaDefinicion {
  codigo: string;
  productoCodigo: string;
  descripcion: string;
  tipo: TipoParametro;
  valorDefecto: ValorJson;
  alcanceMaximo: AlcanceParametro;
  esquema: object | null;
  obsoleto: boolean;
  actualizadoEn: Date;
}

export interface FilaDefinicionAplicada {
  id: string;
  productoCodigo: string;
  cambios: ResumenDefiniciones;
  aplicadoEn: Date;
}

export const ParametroDefEntidad = new EntitySchema<FilaDefinicion>({
  name: 'ParametroDef',
  schema: 'cfg',
  tableName: 'parametro_def',
  columns: {
    codigo: { type: 'varchar', length: 80, primary: true },
    productoCodigo: { name: 'producto_codigo', type: 'varchar', length: 5 },
    descripcion: { type: 'varchar', length: 250 },
    tipo: { type: 'varchar', length: 8 },
    valorDefecto: { name: 'valor_defecto', type: 'jsonb' },
    alcanceMaximo: { name: 'alcance_maximo', type: 'varchar', length: 8 },
    esquema: { type: 'jsonb', nullable: true },
    obsoleto: { type: 'boolean', default: false },
    actualizadoEn: { name: 'actualizado_en', type: 'timestamptz', default: () => 'now()' },
  },
});

export const DefinicionAplicadaEntidad = new EntitySchema<FilaDefinicionAplicada>({
  name: 'DefinicionAplicada',
  schema: 'cfg',
  tableName: 'definiciones_aplicadas',
  columns: {
    // bigserial: node-pg devuelve bigint como string.
    id: { type: 'bigint', primary: true, generated: 'increment' },
    productoCodigo: { name: 'producto_codigo', type: 'varchar', length: 5 },
    cambios: { type: 'jsonb' },
    aplicadoEn: { name: 'aplicado_en', type: 'timestamptz', default: () => 'now()' },
  },
});

export interface FilaValor {
  id: string;
  tenantId: string;
  codigo: string;
  alcance: AlcanceParametro;
  empresaId: string | null;
  sucursalId: string | null;
  valor: ValorJson;
  /** bigint: node-pg lo devuelve como string. */
  version: string;
  modificadoPor: string;
  modificadoEn: Date;
}

export const ParametroValorEntidad = new EntitySchema<FilaValor>({
  name: 'ParametroValor',
  schema: 'cfg',
  tableName: 'parametro_valor',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    codigo: { type: 'varchar', length: 80 },
    alcance: { type: 'varchar', length: 8 },
    empresaId: { name: 'empresa_id', type: 'uuid', nullable: true },
    sucursalId: { name: 'sucursal_id', type: 'uuid', nullable: true },
    valor: { type: 'jsonb' },
    // Bloqueo optimista propio (WHERE version = previa): la versión la lleva el agregado, no TypeORM.
    version: { type: 'bigint' },
    modificadoPor: { name: 'modificado_por', type: 'uuid' },
    modificadoEn: { name: 'modificado_en', type: 'timestamptz' },
  },
});

/** Se registran en el DataSource de quien use la lib (CLI y apps/api). */
export const ENTIDADES_CFG = [ParametroDefEntidad, DefinicionAplicadaEntidad, ParametroValorEntidad, EmpresaNombreEntidad, SucursalNombreEntidad];
