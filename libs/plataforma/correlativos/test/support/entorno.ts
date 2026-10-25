import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AlsTenantContext, InMemoryEventSchemaValidator, OutboxPublisher, SystemClock, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { AlcanceActor } from '@vitrina/plataforma/seguridad';
import type { DependenciasSeries } from '../../src/application/dependencias-series.js';
import { registrarEsquemasSeq } from '../../src/infrastructure/event-schemas.js';
import { ENTIDADES_SEQ } from '../../src/infrastructure/typeorm/entidades.js';
import { SeriesRepositorioTypeOrm } from '../../src/infrastructure/typeorm/series.repositorio.js';
import { UbicacionesSerieTypeOrm } from '../../src/infrastructure/typeorm/ubicaciones-serie.typeorm.js';
import { createTempDb, type TempDb } from './temp-db.js';

export interface Organizacion {
  tenantId: string;
  empresaId: string;
  central: string;
  cayma: string;
  ventanilla: string;
  usuarioId: string;
}

/** Pila real de los casos de uso de series: base temporal con db/ aplicado, UoW, outbox y repositorios ORM. */
export interface EntornoSeries {
  dataSource: DataSource;
  contexto: AlsTenantContext;
  unidadDeTrabajo: TypeOrmUnitOfWork;
  dependencias: DependenciasSeries;
  /** El actor cubre todo salvo las sucursales que diga `negar` (AlcanceActorSeg se prueba en seguridad). */
  negar: { sucursales: Set<string> };
  en<T>(tenantId: string, trabajo: () => Promise<T>): Promise<T>;
  eventosDe(serieId: string): Promise<Record<string, unknown>[]>;
  organizacion(): Promise<Organizacion>;
  cerrar(): Promise<void>;
}

/** `conexiones`: tamaño del pool, para las pruebas de concurrencia (por defecto el de node-pg, 10). */
export async function crearEntornoSeries(opciones: { conexiones?: number } = {}): Promise<EntornoSeries> {
  const baseTemporal: TempDb = await createTempDb();
  const extra = opciones.conexiones ? { max: opciones.conexiones } : undefined;
  const dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_SEQ, extra });
  await dataSource.initialize();
  const contexto = new AlsTenantContext();
  const unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
  const validador = new InMemoryEventSchemaValidator();
  registrarEsquemasSeq(validador);
  const negar = { sucursales: new Set<string>() };
  const alcanceActor: AlcanceActor = { cubre: async (_usuarioId, destino) => !negar.sucursales.has(destino.sucursalId ?? '') };

  const dependencias: DependenciasSeries = {
    unidadDeTrabajo,
    contexto,
    ids: { next: uuidV7 },
    reloj: new SystemClock(),
    eventos: new OutboxPublisher(unidadDeTrabajo, contexto, validador, { next: uuidV7 }),
    series: new SeriesRepositorioTypeOrm(unidadDeTrabajo, contexto),
    ubicaciones: new UbicacionesSerieTypeOrm(unidadDeTrabajo, contexto),
    alcanceActor,
  };

  return {
    dataSource,
    contexto,
    unidadDeTrabajo,
    dependencias,
    negar,
    en: (tenantId, trabajo) => contexto.run({ tenantId }, trabajo),
    eventosDe: (serieId) =>
      dataSource.query(
        `SELECT event_type, aggregate_type, version, payload FROM sync.outbox WHERE aggregate_id = $1 ORDER BY occurred_at, version`,
        [serieId],
      ),
    organizacion: () => sembrarOrganizacion(dataSource),
    cerrar: async () => {
      await dataSource.destroy();
      await baseTemporal.drop();
    },
  };
}

// El RUC es único por tenant: cada organización sembrada puede repetirlo.
const RUC = '20400000001';

/** Inserta como superusuario (salta la RLS): un tenant con «Central», «Cayma» (0002) y «Ventanilla 1», y un usuario. */
async function sembrarOrganizacion(dataSource: DataSource): Promise<Organizacion> {
  const organizacion: Organizacion = {
    tenantId: uuidV7(),
    empresaId: uuidV7(),
    central: uuidV7(),
    cayma: uuidV7(),
    ventanilla: uuidV7(),
    usuarioId: uuidV7(),
  };
  const sufijo = randomUUID().slice(0, 8);
  const { tenantId, empresaId } = organizacion;
  await dataSource.query(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $2, 'Tenant seq', 'ACTIVO', 1)`, [tenantId, `seq-${sufijo}`]);
  await dataSource.query(`INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ($1, $2, $3, 'Seq Arequipa SAC', 1)`, [
    empresaId,
    tenantId,
    RUC,
  ]);
  await dataSource.query(
    `INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version) VALUES
       ($1, $3, $4, 'CENT', 'Central', '0000', true, 1),
       ($2, $3, $4, 'CAYM', 'Cayma', '0002', false, 1)`,
    [organizacion.central, organizacion.cayma, tenantId, empresaId],
  );
  await dataSource.query(
    `INSERT INTO org.unidad_operativa (id, tenant_id, empresa_id, sucursal_id, tipo, codigo, nombre, version)
     VALUES ($1, $2, $3, $4, 'VENTANILLA', 'VEN-01', 'Ventanilla 1', 1)`,
    [organizacion.ventanilla, tenantId, empresaId, organizacion.cayma],
  );
  await dataSource.query(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, $2, 'Ana', 'INTERNO', 'ACTIVO')`, [
    organizacion.usuarioId,
    `ana.${sufijo}@gmail.com`,
  ]);
  return organizacion;
}
