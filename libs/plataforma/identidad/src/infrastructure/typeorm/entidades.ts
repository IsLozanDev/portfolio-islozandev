import { EntitySchema } from 'typeorm';

// Mapeo ORM de las tablas de idn. El esquema lo definen las migraciones de db/ (sin synchronize):
// aquí solo se describe lo que ya existe.

export interface FilaProveedor {
  codigo: string;
  tiposDoc: string[];
  prioridad: number;
  ttlDias: number;
  timeoutMs: number;
  activo: boolean;
  version: number;
}

/** Claves en snake_case: las que admite ck_cache_campos. */
export type DatosCacheDni = { nombres: string; apellidos: string };
export type DatosCacheRuc = {
  razon_social: string;
  estado: string;
  condicion: string;
  direccion_fiscal: string;
  ubigeo: string;
};

export interface FilaCacheDocumento {
  tipoDoc: string;
  numero: string;
  datos: DatosCacheDni | DatosCacheRuc;
  fuente: string;
  consultadoEn: Date;
  expiraEn: Date;
}

export interface FilaConsultaLog {
  /** bigint: node-pg lo devuelve como string. */
  id: string;
  tenantId: string;
  usuarioId: string | null;
  productoCodigo: string | null;
  tipoDoc: string;
  numeroHash: string;
  motivo: string;
  resultado: string;
  proveedor: string | null;
  consultadoEn: Date;
}

export interface FilaCuota {
  tenantId: string;
  periodo: string;
  plan: string;
  incluidas: number;
  consumidas: number;
  avisadoUmbralEn: Date | null;
  avisadoAgotadaEn: Date | null;
  creadaEn: Date;
  version: number;
}

// La app edita solo prioridad, ttl, timeout y activo de idn.proveedor (con version).
export const ProveedorEntidad = new EntitySchema<FilaProveedor>({
  name: 'ProveedorIdentidad',
  schema: 'idn',
  tableName: 'proveedor',
  columns: {
    codigo: { type: 'varchar', length: 30, primary: true },
    tiposDoc: { name: 'tipos_doc', type: 'varchar', length: 3, array: true },
    prioridad: { type: 'smallint' },
    ttlDias: { name: 'ttl_dias', type: 'smallint' },
    timeoutMs: { name: 'timeout_ms', type: 'integer' },
    activo: { type: 'boolean' },
    version: { type: 'integer' },
  },
});

export const CacheDocumentoEntidad = new EntitySchema<FilaCacheDocumento>({
  name: 'CacheDocumento',
  schema: 'idn',
  tableName: 'cache_documento',
  columns: {
    tipoDoc: { name: 'tipo_doc', type: 'varchar', length: 3, primary: true },
    numero: { type: 'varchar', length: 11, primary: true },
    datos: { type: 'jsonb' },
    fuente: { type: 'varchar', length: 30 },
    consultadoEn: { name: 'consultado_en', type: 'timestamptz' },
    expiraEn: { name: 'expira_en', type: 'timestamptz' },
  },
});

export const ConsultaLogEntidad = new EntitySchema<FilaConsultaLog>({
  name: 'ConsultaLog',
  schema: 'idn',
  tableName: 'consulta_log',
  columns: {
    id: { type: 'bigint', primary: true, generated: 'increment' },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    usuarioId: { name: 'usuario_id', type: 'uuid', nullable: true },
    productoCodigo: { name: 'producto_codigo', type: 'varchar', length: 10, nullable: true },
    tipoDoc: { name: 'tipo_doc', type: 'varchar', length: 3 },
    numeroHash: { name: 'numero_hash', type: 'varchar', length: 71 },
    motivo: { type: 'varchar', length: 30 },
    resultado: { type: 'varchar', length: 30 },
    proveedor: { type: 'varchar', length: 30, nullable: true },
    consultadoEn: { name: 'consultado_en', type: 'timestamptz' },
  },
});

export const CuotaEntidad = new EntitySchema<FilaCuota>({
  name: 'CuotaIdentidad',
  schema: 'idn',
  tableName: 'cuota',
  columns: {
    tenantId: { name: 'tenant_id', type: 'uuid', primary: true },
    periodo: { type: 'char', length: 7, primary: true },
    plan: { type: 'varchar', length: 10 },
    incluidas: { type: 'integer' },
    consumidas: { type: 'integer' },
    avisadoUmbralEn: { name: 'avisado_umbral_en', type: 'timestamptz', nullable: true },
    avisadoAgotadaEn: { name: 'avisado_agotada_en', type: 'timestamptz', nullable: true },
    creadaEn: { name: 'creada_en', type: 'timestamptz' },
    version: { type: 'integer' },
  },
});

export const ENTIDADES_IDN = [ProveedorEntidad, CacheDocumentoEntidad, ConsultaLogEntidad, CuotaEntidad];
