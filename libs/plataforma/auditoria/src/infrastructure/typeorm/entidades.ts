import { EntitySchema } from 'typeorm';
import type { FilaAuditoria } from '../../application/ports/registro-auditoria.port.js';

// Mapeo ORM de aud.evento_auditoria. El esquema lo define db/01g_aud.sql (sin synchronize).

/** Lo que guarda una columna jsonb. */
export type ValorJson = object | string | number | boolean | null;

export interface FilaEventoAuditoria extends Omit<FilaAuditoria, 'antes' | 'despues'> {
  antes?: ValorJson;
  despues?: ValorJson;
  /** Los ponen el trigger aud.encadenar() y el DEFAULT: TypeORM no los inserta. */
  numero?: string;
  hashAnterior?: string;
  hash?: string;
  registradoEn?: Date;
}

const SOLO_LECTURA = { insert: false, update: false } as const;

export const EventoAuditoriaEntidad = new EntitySchema<FilaEventoAuditoria>({
  name: 'EventoAuditoria',
  schema: 'aud',
  tableName: 'evento_auditoria',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    numero: { type: 'bigint', ...SOLO_LECTURA },
    tipo: { type: 'varchar', length: 16 },
    origen: { type: 'varchar', length: 8 },
    eventId: { name: 'event_id', type: 'uuid', nullable: true },
    accion: { type: 'varchar', length: 80 },
    entidadTipo: { name: 'entidad_tipo', type: 'varchar', length: 40 },
    entidadId: { name: 'entidad_id', type: 'varchar', length: 80 },
    usuarioId: { name: 'usuario_id', type: 'uuid', nullable: true },
    sucursalId: { name: 'sucursal_id', type: 'uuid', nullable: true },
    antes: { type: 'jsonb', nullable: true },
    despues: { type: 'jsonb', nullable: true },
    motivo: { type: 'varchar', length: 500, nullable: true },
    personaTitularId: { name: 'persona_titular_id', type: 'uuid', nullable: true },
    finalidad: { type: 'varchar', length: 20, nullable: true },
    ticket: { type: 'varchar', length: 40, nullable: true },
    ip: { type: 'inet', nullable: true },
    traceId: { name: 'trace_id', type: 'varchar', length: 32, nullable: true },
    ocurridoEn: { name: 'ocurrido_en', type: 'timestamptz' },
    registradoEn: { name: 'registrado_en', type: 'timestamptz', ...SOLO_LECTURA },
    hashAnterior: { name: 'hash_anterior', type: 'char', length: 64, ...SOLO_LECTURA },
    hash: { type: 'char', length: 64, ...SOLO_LECTURA },
  },
});

/** aud.verificacion_integridad (spec 20b, db/01g_aud_integridad.sql): solo inserción. Los bigint viajan como texto. */
export interface FilaVerificacionIntegridad {
  id: string;
  tenantId: string;
  modo: string;
  desdeNumero: string;
  hastaNumero: string;
  ultimoHash: string;
  filas: string;
  estado: string;
  numeroRoto: string | null;
  motivo: string | null;
  iniciadaEn: Date;
  terminadaEn: Date;
}

export const VerificacionIntegridadEntidad = new EntitySchema<FilaVerificacionIntegridad>({
  name: 'VerificacionIntegridad',
  schema: 'aud',
  tableName: 'verificacion_integridad',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    modo: { type: 'varchar', length: 12 },
    desdeNumero: { name: 'desde_numero', type: 'bigint' },
    hastaNumero: { name: 'hasta_numero', type: 'bigint' },
    ultimoHash: { name: 'ultimo_hash', type: 'char', length: 64 },
    filas: { type: 'bigint' },
    estado: { type: 'varchar', length: 6 },
    numeroRoto: { name: 'numero_roto', type: 'bigint', nullable: true },
    motivo: { type: 'varchar', length: 12, nullable: true },
    iniciadaEn: { name: 'iniciada_en', type: 'timestamptz' },
    terminadaEn: { name: 'terminada_en', type: 'timestamptz' },
  },
});

/** Se registran en el DataSource de quien use la lib (apps/api y apps/worker). */
export const ENTIDADES_AUDITORIA = [EventoAuditoriaEntidad, VerificacionIntegridadEntidad];
