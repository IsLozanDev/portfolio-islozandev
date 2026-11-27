import { EntitySchema } from 'typeorm';

// Mapeo ORM de las tablas de ntf. El esquema lo definen las migraciones de db/ (sin synchronize):
// aquí solo se describe lo que ya existe.

export interface FilaPlantilla {
  id: string;
  tenantId: string | null;
  codigo: string;
  nombre: string;
  canal: string;
  idioma: string;
  version: number;
  asunto: string | null;
  cuerpo: string;
  variables: { nombre: string; tipo: string; ejemplo?: string }[];
  plantillaBaseId: string | null;
  activa: boolean;
  personalizable: boolean;
  creadoPor: string | null;
  creadoEn: Date;
}

export interface FilaMensaje {
  id: string;
  tenantId: string;
  plantillaId: string;
  canal: string;
  destino: string;
  destinoHash: string;
  personaId: string | null;
  finalidad: string;
  asunto: string;
  cuerpo: string;
  claveIdempotencia: string;
  estado: string;
  idExterno: string | null;
  motivoFallo: string | null;
  programadoPara: Date | null;
  enviadoEn: Date | null;
  entregadoEn: Date | null;
  version: number;
  creadoPor: string | null;
  creadoEn: Date;
  modificadoEn: Date | null;
}

export interface FilaIntentoEntrega {
  id: string;
  tenantId: string;
  mensajeId: string;
  numero: number;
  resultado: string;
  respuestaProveedor: Record<string, string>;
  en: Date;
}

export interface FilaContactoInvalido {
  tenantId: string;
  canal: string;
  destinoHash: string;
  motivo: string;
  desde: Date;
}

export const PlantillaEntidad = new EntitySchema<FilaPlantilla>({
  name: 'PlantillaNotificacion',
  schema: 'ntf',
  tableName: 'plantilla',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid', nullable: true },
    codigo: { type: 'varchar', length: 60 },
    nombre: { type: 'varchar', length: 120 },
    canal: { type: 'varchar', length: 10 },
    idioma: { type: 'varchar', length: 5 },
    // Versión de la plantilla, no bloqueo optimista: las versiones son filas nuevas.
    version: { type: 'integer' },
    asunto: { type: 'varchar', length: 150, nullable: true },
    cuerpo: { type: 'text' },
    variables: { type: 'jsonb' },
    plantillaBaseId: { name: 'plantilla_base_id', type: 'uuid', nullable: true },
    activa: { type: 'boolean' },
    personalizable: { type: 'boolean' },
    creadoPor: { name: 'creado_por', type: 'uuid', nullable: true },
    creadoEn: { name: 'creado_en', type: 'timestamptz', createDate: true },
  },
});

export const MensajeEntidad = new EntitySchema<FilaMensaje>({
  name: 'MensajeNotificacion',
  schema: 'ntf',
  tableName: 'mensaje',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    plantillaId: { name: 'plantilla_id', type: 'uuid' },
    canal: { type: 'varchar', length: 10 },
    destino: { type: 'varchar', length: 254 },
    destinoHash: { name: 'destino_hash', type: 'varchar', length: 80 },
    personaId: { name: 'persona_id', type: 'uuid', nullable: true },
    finalidad: { type: 'varchar', length: 14 },
    asunto: { type: 'varchar', length: 150 },
    cuerpo: { type: 'text' },
    claveIdempotencia: { name: 'clave_idempotencia', type: 'uuid' },
    estado: { type: 'varchar', length: 28 },
    idExterno: { name: 'id_externo', type: 'varchar', length: 100, nullable: true },
    motivoFallo: { name: 'motivo_fallo', type: 'varchar', length: 300, nullable: true },
    programadoPara: { name: 'programado_para', type: 'timestamptz', nullable: true },
    enviadoEn: { name: 'enviado_en', type: 'timestamptz', nullable: true },
    entregadoEn: { name: 'entregado_en', type: 'timestamptz', nullable: true },
    // TypeORM la sube en uno en cada UPDATE.
    version: { type: 'integer', version: true },
    creadoPor: { name: 'creado_por', type: 'uuid', nullable: true },
    creadoEn: { name: 'creado_en', type: 'timestamptz', createDate: true },
    modificadoEn: { name: 'modificado_en', type: 'timestamptz', nullable: true },
  },
});

export const IntentoEntregaEntidad = new EntitySchema<FilaIntentoEntrega>({
  name: 'IntentoEntregaNotificacion',
  schema: 'ntf',
  tableName: 'intento_entrega',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    mensajeId: { name: 'mensaje_id', type: 'uuid' },
    numero: { type: 'smallint' },
    resultado: { type: 'varchar', length: 20 },
    respuestaProveedor: { name: 'respuesta_proveedor', type: 'jsonb' },
    en: { type: 'timestamptz' },
  },
});

export const ContactoInvalidoEntidad = new EntitySchema<FilaContactoInvalido>({
  name: 'ContactoInvalidoNotificacion',
  schema: 'ntf',
  tableName: 'contacto_invalido',
  columns: {
    tenantId: { name: 'tenant_id', type: 'uuid', primary: true },
    canal: { type: 'varchar', length: 10, primary: true },
    destinoHash: { name: 'destino_hash', type: 'varchar', length: 80, primary: true },
    motivo: { type: 'varchar', length: 40 },
    desde: { type: 'timestamptz', createDate: true },
  },
});

export interface FilaProgramacion {
  id: string;
  tenantId: string;
  referenciaTipo: string;
  referenciaId: string;
  plantillaCodigo: string;
  destinatario: { personaId: string } | { correo: string };
  variables: Record<string, string | number>;
  finalidad: string;
  enviarEn: Date;
  estado: string;
  motivo: string | null;
  mensajeId: string | null;
  version: number;
  creadoPor: string | null;
  creadoEn: Date;
  modificadoEn: Date | null;
}

export const ProgramacionEntidad = new EntitySchema<FilaProgramacion>({
  name: 'ProgramacionNotificacion',
  schema: 'ntf',
  tableName: 'programacion',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    referenciaTipo: { name: 'referencia_tipo', type: 'varchar', length: 40 },
    referenciaId: { name: 'referencia_id', type: 'varchar', length: 100 },
    plantillaCodigo: { name: 'plantilla_codigo', type: 'varchar', length: 60 },
    destinatario: { type: 'jsonb' },
    variables: { type: 'jsonb' },
    finalidad: { type: 'varchar', length: 14 },
    enviarEn: { name: 'enviar_en', type: 'timestamptz' },
    estado: { type: 'varchar', length: 12 },
    motivo: { type: 'varchar', length: 40, nullable: true },
    mensajeId: { name: 'mensaje_id', type: 'uuid', nullable: true },
    // Bloqueo optimista que sube el dominio en cada cambio: también va en el jobId de la cola.
    version: { type: 'integer' },
    creadoPor: { name: 'creado_por', type: 'uuid', nullable: true },
    creadoEn: { name: 'creado_en', type: 'timestamptz', createDate: true },
    modificadoEn: { name: 'modificado_en', type: 'timestamptz', nullable: true },
  },
});

export interface FilaBaja {
  id: string;
  tenantId: string;
  canal: string;
  alcance: string;
  destinoHash: string;
  personaId: string | null;
  origen: string;
  registradaEn: Date;
}

export const BajaEntidad = new EntitySchema<FilaBaja>({
  name: 'BajaNotificacion',
  schema: 'ntf',
  tableName: 'baja',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    canal: { type: 'varchar', length: 10 },
    alcance: { type: 'varchar', length: 12 },
    destinoHash: { name: 'destino_hash', type: 'varchar', length: 80 },
    personaId: { name: 'persona_id', type: 'uuid', nullable: true },
    origen: { type: 'varchar', length: 10, default: 'ENLACE' },
    registradaEn: { name: 'registrada_en', type: 'timestamptz', createDate: true },
  },
});

export const ENTIDADES_NOT = [PlantillaEntidad, MensajeEntidad, IntentoEntregaEntidad, ContactoInvalidoEntidad, ProgramacionEntidad, BajaEntidad];
