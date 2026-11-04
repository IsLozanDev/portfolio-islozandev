import { EntitySchema } from 'typeorm';
import type { CausaCierreSoporte, EstadoSoporte, ModoSoporte } from '../../domain/acceso-soporte.js';

// Mapeo ORM de seg.acceso_soporte (spec 18). El esquema lo define db/01b_seg_soporte.sql (sin synchronize).

export interface FilaAccesoSoporte {
  id: string;
  tenantId: string;
  agenteId: string;
  ticket: string;
  motivo: string;
  modo: ModoSoporte;
  horasSolicitadas: number;
  estado: EstadoSoporte;
  solicitadoEn: Date;
  caducaEn: Date;
  aprobadoPor: string | null;
  horasAprobadas: number | null;
  desde: Date | null;
  hasta: Date | null;
  membresiaId: string | null;
  asignacionId: string | null;
  cerradoPor: string | null;
  cerradoEn: Date | null;
  motivoCierre: string | null;
  causaCierre: CausaCierreSoporte | null;
  /** bigint: node-pg lo devuelve como string. */
  version: string;
}

export const AccesoSoporteEntidad = new EntitySchema<FilaAccesoSoporte>({
  name: 'SegAccesoSoporte',
  schema: 'seg',
  tableName: 'acceso_soporte',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid', update: false },
    agenteId: { name: 'agente_id', type: 'uuid', update: false },
    ticket: { type: 'char', length: 10, update: false },
    motivo: { type: 'varchar', length: 300, update: false },
    modo: { type: 'varchar', length: 10, update: false },
    horasSolicitadas: { name: 'horas_solicitadas', type: 'smallint', update: false },
    estado: { type: 'varchar', length: 10 },
    solicitadoEn: { name: 'solicitado_en', type: 'timestamptz', update: false },
    caducaEn: { name: 'caduca_en', type: 'timestamptz', update: false },
    aprobadoPor: { name: 'aprobado_por', type: 'uuid', nullable: true },
    horasAprobadas: { name: 'horas_aprobadas', type: 'smallint', nullable: true },
    desde: { type: 'timestamptz', nullable: true },
    hasta: { type: 'timestamptz', nullable: true },
    membresiaId: { name: 'membresia_id', type: 'uuid', nullable: true },
    asignacionId: { name: 'asignacion_id', type: 'uuid', nullable: true },
    cerradoPor: { name: 'cerrado_por', type: 'uuid', nullable: true },
    cerradoEn: { name: 'cerrado_en', type: 'timestamptz', nullable: true },
    motivoCierre: { name: 'motivo_cierre', type: 'varchar', length: 300, nullable: true },
    causaCierre: { name: 'causa_cierre', type: 'varchar', length: 15, nullable: true },
    // Bloqueo optimista propio (WHERE version = previa): la versión la lleva el agregado, no TypeORM.
    version: { type: 'bigint' },
  },
});

/** Se registran en el DataSource de quien use la lib (apps/api y apps/worker). */
export const ENTIDADES_SEG_SOPORTE = [AccesoSoporteEntidad];
