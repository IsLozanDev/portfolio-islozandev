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
  /** Conservada de una absorbida (spec 39); nula en las demás. */
  fusionadaEnId: string | null;
  fusionadaEn: Date | null;
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

export interface FilaDireccion {
  id: string;
  personaId: string;
  tenantId: string;
  direccion: string;
  referencia: string | null;
  ubigeo: string;
  distrito: string;
  provincia: string;
  departamento: string;
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
    fusionadaEnId: { name: 'fusionada_en_id', type: 'uuid', nullable: true },
    fusionadaEn: { name: 'fusionada_en', type: 'timestamptz', nullable: true },
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

export const DireccionEntidad = new EntitySchema<FilaDireccion>({
  name: 'DireccionPersona',
  schema: 'per',
  tableName: 'direccion',
  columns: {
    id: { type: 'uuid', primary: true },
    personaId: { name: 'persona_id', type: 'uuid' },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    direccion: { type: 'varchar', length: 250 },
    referencia: { type: 'varchar', length: 150, nullable: true },
    ubigeo: { type: 'varchar', length: 6 },
    distrito: { type: 'varchar', length: 200 },
    provincia: { type: 'varchar', length: 200 },
    departamento: { type: 'varchar', length: 200 },
    principal: { type: 'boolean' },
    creadoEn: { name: 'creado_en', type: 'timestamptz', createDate: true },
  },
});

export interface FilaTextoFinalidad {
  id: string;
  tenantId: string;
  finalidad: string;
  version: string;
  texto: string;
  publicadoPor: string;
  publicadoEn: Date;
}

export interface FilaConsentimiento {
  id: string;
  tenantId: string;
  personaId: string;
  finalidad: string;
  decision: string;
  versionTexto: string;
  canal: string;
  accionExpresa: boolean;
  evidenciaArchivoId: string | null;
  registradoPor: string;
  registradoEn: Date;
  revocadoEn: Date | null;
  revocadoPor: string | null;
  canalRevocacion: string | null;
}

export const TextoFinalidadEntidad = new EntitySchema<FilaTextoFinalidad>({
  name: 'TextoFinalidad',
  schema: 'per',
  tableName: 'texto_finalidad',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    finalidad: { type: 'varchar', length: 24 },
    version: { type: 'varchar', length: 20 },
    texto: { type: 'text' },
    publicadoPor: { name: 'publicado_por', type: 'uuid' },
    publicadoEn: { name: 'publicado_en', type: 'timestamptz' },
  },
});

export const ConsentimientoEntidad = new EntitySchema<FilaConsentimiento>({
  name: 'Consentimiento',
  schema: 'per',
  tableName: 'consentimiento',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    personaId: { name: 'persona_id', type: 'uuid' },
    finalidad: { type: 'varchar', length: 24 },
    decision: { type: 'varchar', length: 8 },
    versionTexto: { name: 'version_texto', type: 'varchar', length: 20 },
    canal: { type: 'varchar', length: 10 },
    accionExpresa: { name: 'accion_expresa', type: 'boolean' },
    evidenciaArchivoId: { name: 'evidencia_archivo_id', type: 'uuid', nullable: true },
    registradoPor: { name: 'registrado_por', type: 'uuid' },
    registradoEn: { name: 'registrado_en', type: 'timestamptz' },
    revocadoEn: { name: 'revocado_en', type: 'timestamptz', nullable: true },
    revocadoPor: { name: 'revocado_por', type: 'uuid', nullable: true },
    canalRevocacion: { name: 'canal_revocacion', type: 'varchar', length: 10, nullable: true },
  },
});

export const ENTIDADES_PER = [
  PersonaEntidad,
  PersonaRolEntidad,
  ContactoEntidad,
  DireccionEntidad,
  TextoFinalidadEntidad,
  ConsentimientoEntidad,
];
