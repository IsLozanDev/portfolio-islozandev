import { EntitySchema } from 'typeorm';

// Mapeo ORM de las tablas de sec. El esquema lo definen las migraciones de db/ (sin synchronize):
// aquí solo se describe lo que ya existe. `bytea` llega del driver como Buffer.

export interface FilaClaveTenant {
  tenantId: string;
  claveCifrada: Buffer;
  iv: Buffer;
  versionClaveMaestra: number;
  creadoEn: Date;
  reenvueltaEn: Date | null;
}

export interface FilaSecreto {
  id: string;
  tenantId: string;
  tipo: string;
  cifrado: Buffer;
  iv: Buffer;
  version: number;
  creadoPor: string;
  creadoEn: Date;
  rotadoPor: string | null;
  rotadoEn: Date | null;
}

export const ClaveTenantEntidad = new EntitySchema<FilaClaveTenant>({
  name: 'ClaveTenant',
  schema: 'sec',
  tableName: 'clave_tenant',
  columns: {
    tenantId: { name: 'tenant_id', type: 'uuid', primary: true },
    claveCifrada: { name: 'clave_cifrada', type: 'bytea' },
    iv: { type: 'bytea' },
    versionClaveMaestra: { name: 'version_clave_maestra', type: 'smallint' },
    creadoEn: { name: 'creado_en', type: 'timestamptz', createDate: true },
    reenvueltaEn: { name: 'reenvuelta_en', type: 'timestamptz', nullable: true },
  },
});

export const SecretoEntidad = new EntitySchema<FilaSecreto>({
  name: 'Secreto',
  schema: 'sec',
  tableName: 'secreto',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    tipo: { type: 'varchar', length: 60 },
    cifrado: { type: 'bytea' },
    iv: { type: 'bytea' },
    // TypeORM la sube en uno en cada UPDATE.
    version: { type: 'integer', version: true },
    creadoPor: { name: 'creado_por', type: 'uuid' },
    creadoEn: { name: 'creado_en', type: 'timestamptz', createDate: true },
    rotadoPor: { name: 'rotado_por', type: 'uuid', nullable: true },
    rotadoEn: { name: 'rotado_en', type: 'timestamptz', nullable: true },
  },
});

export const ENTIDADES_SEC = [ClaveTenantEntidad, SecretoEntidad];
