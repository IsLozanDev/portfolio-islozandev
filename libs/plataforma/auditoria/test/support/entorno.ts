import { DataSource } from 'typeorm';
import { AlsTenantContext, SystemClock, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { DependenciasRegistro } from '../../src/application/dependencias-registro.js';
import { RegistrarAccesoSensible } from '../../src/application/registrar-acceso-sensible.js';
import { RegistrarEvento } from '../../src/application/registrar-evento.js';
import { ENTIDADES_AUDITORIA } from '../../src/infrastructure/typeorm/entidades.js';
import { RegistroAuditoriaTypeOrm } from '../../src/infrastructure/typeorm/registro-auditoria.typeorm.js';
import { createTempDb, type TempDb } from './temp-db.js';

/** Fila de aud.evento_auditoria tal como la devuelve node-pg. */
export interface FilaLeida {
  id: string;
  numero: string;
  tipo: string;
  origen: string;
  event_id: string | null;
  accion: string;
  entidad_tipo: string;
  entidad_id: string;
  usuario_id: string | null;
  sucursal_id: string | null;
  antes: unknown;
  despues: unknown;
  motivo: string | null;
  persona_titular_id: string | null;
  finalidad: string | null;
  ticket: string | null;
  ip: string | null;
  trace_id: string | null;
  ocurrido_en: Date;
  hash_anterior: string;
  hash: string;
  /** aud.calcular_hash recalculado sobre la fila guardada. */
  hash_recalculado: string;
}

/** Pila real del registro directo: base temporal con db/ aplicado, UoW y adaptador ORM. */
export interface EntornoAuditoria {
  dataSource: DataSource;
  unidadDeTrabajo: TypeOrmUnitOfWork;
  contexto: AlsTenantContext;
  registrarEvento: RegistrarEvento;
  registrarAccesoSensible: RegistrarAccesoSensible;
  avisos: { mensaje: string; datos: Record<string, unknown> }[];
  /** Filas del tenant ordenadas por numero. La conexión de prueba es superusuario: lee sin RLS. */
  filas(tenantId: string): Promise<FilaLeida[]>;
  cerrar(): Promise<void>;
}

export async function crearEntornoAuditoria(): Promise<EntornoAuditoria> {
  const baseTemporal: TempDb = await createTempDb();
  const dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_AUDITORIA });
  await dataSource.initialize();
  const contexto = new AlsTenantContext();
  const unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
  const avisos: EntornoAuditoria['avisos'] = [];
  const dependencias: DependenciasRegistro = {
    contexto,
    ids: { next: uuidV7 },
    reloj: new SystemClock(),
    registro: new RegistroAuditoriaTypeOrm(unidadDeTrabajo, (mensaje, datos) => avisos.push({ mensaje, datos })),
  };

  return {
    dataSource,
    unidadDeTrabajo,
    contexto,
    registrarEvento: new RegistrarEvento(dependencias),
    registrarAccesoSensible: new RegistrarAccesoSensible(dependencias),
    avisos,
    filas: (tenantId) =>
      dataSource.query(
        `SELECT e.*, host(e.ip) AS ip, aud.calcular_hash(e, e.hash_anterior) AS hash_recalculado
           FROM aud.evento_auditoria e WHERE e.tenant_id = $1 ORDER BY e.numero`,
        [tenantId],
      ),
    cerrar: async () => {
      await dataSource.destroy();
      await baseTemporal.drop();
    },
  };
}

/** Cada fila encadena con la anterior, la primera con 64 ceros, y el hash guardado se reproduce. */
export function cadenaValida(filas: FilaLeida[]): boolean {
  const HASH_INICIAL = '0'.repeat(64);
  return filas.every(
    (fila, indice) =>
      Number(fila.numero) === indice + 1 &&
      fila.hash_anterior === (indice === 0 ? HASH_INICIAL : filas[indice - 1].hash) &&
      fila.hash === fila.hash_recalculado,
  );
}
