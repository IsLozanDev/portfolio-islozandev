import { EntitySchema } from 'typeorm';
import type { Reinicio, TipoDocumento } from '../../domain/tipos.js';
import { EmpresaSerieEntidad, SucursalSerieEntidad, UnidadSerieEntidad } from './entidades-org.js';

// Mapeo ORM de las tablas de seq. El esquema lo definen las migraciones de db/ (sin synchronize):
// aquí solo se describe lo que ya existe.

export interface FilaSerie {
  id: string;
  tenantId: string;
  empresaId: string;
  sucursalId: string | null;
  unidadId: string | null;
  tipo: TipoDocumento;
  serie: string;
  digitos: number;
  reinicio: Reinicio;
  /** bigint: node-pg lo devuelve como string. */
  ultimoNumero: string;
  /** Lo fija y lo avanza la base (trigger y seq.siguiente). */
  periodo?: string | null;
  activa: boolean;
  /** bigint: node-pg lo devuelve como string. */
  version: string;
  creadoPor: string;
  creadoEn: Date;
  modificadoPor: string;
  modificadoEn: Date;
}

export const SerieEntidad = new EntitySchema<FilaSerie>({
  name: 'Serie',
  schema: 'seq',
  tableName: 'serie',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid', update: false },
    empresaId: { name: 'empresa_id', type: 'uuid', update: false },
    sucursalId: { name: 'sucursal_id', type: 'uuid', nullable: true, update: false },
    unidadId: { name: 'unidad_id', type: 'uuid', nullable: true, update: false },
    tipo: { type: 'varchar', length: 12, update: false },
    serie: { type: 'varchar', length: 10, update: false },
    digitos: { type: 'smallint', update: false },
    reinicio: { type: 'varchar', length: 7, update: false },
    // Solo se fija al crear: después lo avanza seq.siguiente bajo bloqueo de fila. Un save nunca lo pisa.
    ultimoNumero: { name: 'ultimo_numero', type: 'bigint', update: false },
    periodo: { type: 'varchar', length: 10, nullable: true, insert: false, update: false },
    activa: { type: 'boolean' },
    // Bloqueo optimista propio (WHERE version = previa): la versión la lleva el agregado, no TypeORM.
    version: { type: 'bigint' },
    creadoPor: { name: 'creado_por', type: 'uuid', update: false },
    creadoEn: { name: 'creado_en', type: 'timestamptz', update: false },
    modificadoPor: { name: 'modificado_por', type: 'uuid' },
    modificadoEn: { name: 'modificado_en', type: 'timestamptz' },
  },
});

/** Se registran en el DataSource de quien use la lib (apps/api). */
export const ENTIDADES_SEQ = [SerieEntidad, EmpresaSerieEntidad, SucursalSerieEntidad, UnidadSerieEntidad];
