import { DataSource } from 'typeorm';
import { AlsTenantContext, InMemoryEventSchemaValidator, OutboxPublisher, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { registrarEsquemasOrg } from '../../src/infrastructure/event-schemas.js';
import { ENTIDADES_ORG } from '../../src/infrastructure/typeorm/entidades.js';
import { EmpresaRepositorioTypeOrm } from '../../src/infrastructure/typeorm/empresa.repositorio.js';
import { SucursalRepositorioTypeOrm } from '../../src/infrastructure/typeorm/sucursal.repositorio.js';
import { SuscripcionRepositorioTypeOrm } from '../../src/infrastructure/typeorm/suscripcion.repositorio.js';
import { TenantRepositorioTypeOrm } from '../../src/infrastructure/typeorm/tenant.repositorio.js';
import { UnidadRepositorioTypeOrm } from '../../src/infrastructure/typeorm/unidad.repositorio.js';
import { createTempDb, type TempDb } from './temp-db.js';

/** Pila real de los casos de uso: base temporal con db/ aplicado, UoW, outbox y repositorios. */
export interface Entorno {
  db: TempDb;
  dataSource: DataSource;
  contexto: AlsTenantContext;
  uow: TypeOrmUnitOfWork;
  eventos: OutboxPublisher;
  ids: { next: () => string };
  repos: {
    tenants: TenantRepositorioTypeOrm;
    suscripciones: SuscripcionRepositorioTypeOrm;
    empresas: EmpresaRepositorioTypeOrm;
    sucursales: SucursalRepositorioTypeOrm;
    unidades: UnidadRepositorioTypeOrm;
  };
  /** Ejecuta `fn` con el tenant en el contexto, como lo hará el guard HTTP. */
  en<T>(tenantId: string, fn: () => Promise<T>): Promise<T>;
  /** Tipos de evento en el outbox para un agregado, en orden. */
  eventosDe(aggregateId: string): Promise<string[]>;
  /** Versión guardada de una fila de org, como la leería el cliente antes de editar. */
  versionDe(tabla: 'empresa' | 'sucursal' | 'unidad_operativa', id: string): Promise<number>;
  cerrar(): Promise<void>;
}

export async function crearEntorno(): Promise<Entorno> {
  const db = await createTempDb();
  const dataSource = new DataSource({ type: 'postgres', url: db.url, entities: ENTIDADES_ORG });
  await dataSource.initialize();
  const contexto = new AlsTenantContext();
  const uow = new TypeOrmUnitOfWork(dataSource, contexto);
  const validator = new InMemoryEventSchemaValidator();
  registrarEsquemasOrg(validator);
  const ids = { next: uuidV7 };

  return {
    db,
    dataSource,
    contexto,
    uow,
    eventos: new OutboxPublisher(uow, contexto, validator, ids),
    ids,
    repos: {
      tenants: new TenantRepositorioTypeOrm(uow, contexto),
      suscripciones: new SuscripcionRepositorioTypeOrm(uow, contexto),
      empresas: new EmpresaRepositorioTypeOrm(uow, contexto),
      sucursales: new SucursalRepositorioTypeOrm(uow, contexto),
      unidades: new UnidadRepositorioTypeOrm(uow, contexto),
    },
    en: (tenantId, fn) => contexto.run({ tenantId }, fn),
    eventosDe: async (aggregateId) =>
      (await dataSource.query('SELECT event_type FROM sync.outbox WHERE aggregate_id = $1 ORDER BY seq', [aggregateId])).map(
        (f: { event_type: string }) => f.event_type,
      ),
    versionDe: async (tabla, id) => Number((await dataSource.query(`SELECT version FROM org.${tabla} WHERE id = $1`, [id]))[0].version),
    cerrar: async () => {
      await dataSource.destroy();
      await db.drop();
    },
  };
}
