import { EntitySchema } from 'typeorm';

// Mapeo ORM de las tablas de per. El esquema lo definen las migraciones de db/ (sin synchronize):
// aquí solo se describe lo que ya existe.

export interface FilaPersona {
  id: string;
  tenantId: string;
  tipoPersona: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  razonSocial: string | null;
  activo: boolean;
  version: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface FilaPersonaRol {
  personaId: string;
  tenantId: string;
  productoCodigo: string;
  rol: string;
  /** `date`: TypeORM lo entrega como texto `AAAA-MM-DD`. */
  desde: string;
  hasta: string | null;
}

export interface FilaContacto {
  id: string;
  personaId: string;
  tenantId: string;
  tipoContacto: string;
  valor: string;
  principal: boolean;
  creadoEn: Date;
}

export const PersonaEntidad = new EntitySchema<FilaPersona>({
  name: 'Persona',
  schema: 'per',
  tableName: 'persona',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    tipoPersona: { name: 'tipo_persona', type: 'varchar', length: 8 },
    tipoDocumento: { name: 'tipo_documento', type: 'varchar', length: 20 },
    numeroDocumento: { name: 'numero_documento', type: 'varchar', length: 12 },
    nombres: { type: 'varchar', length: 100, nullable: true },
    apellidoPaterno: { name: 'apellido_paterno', type: 'varchar', length: 60, nullable: true },
    apellidoMaterno: { name: 'apellido_materno', type: 'varchar', length: 60, nullable: true },
    razonSocial: { name: 'razon_social', type: 'varchar', length: 200, nullable: true },
    activo: { type: 'boolean' },
    // El repositorio escribe la versión del agregado; la columna de versión evita que un UPDATE la olvide.
    version: { type: 'integer', version: true },
    creadoEn: { name: 'creado_en', type: 'timestamptz', createDate: true },
    actualizadoEn: { name: 'actualizado_en', type: 'timestamptz', updateDate: true },
  },
});

export const PersonaRolEntidad = new EntitySchema<FilaPersonaRol>({
  name: 'PersonaRol',
  schema: 'per',
  tableName: 'persona_rol',
  columns: {
    personaId: { name: 'persona_id', type: 'uuid', primary: true },
    productoCodigo: { name: 'producto_codigo', type: 'varchar', length: 5, primary: true },
    rol: { type: 'varchar', length: 12, primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    desde: { type: 'date' },
    hasta: { type: 'date', nullable: true },
  },
});

export const ContactoEntidad = new EntitySchema<FilaContacto>({
  name: 'ContactoPersona',
  schema: 'per',
  tableName: 'contacto',
  columns: {
    id: { type: 'uuid', primary: true },
    personaId: { name: 'persona_id', type: 'uuid' },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    tipoContacto: { name: 'tipo_contacto', type: 'varchar', length: 10 },
    valor: { type: 'varchar', length: 254 },
    principal: { type: 'boolean' },
    creadoEn: { name: 'creado_en', type: 'timestamptz', createDate: true },
  },
});

export const ENTIDADES_PER = [PersonaEntidad, PersonaRolEntidad, ContactoEntidad];
