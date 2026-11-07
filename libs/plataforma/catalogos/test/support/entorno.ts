import { randomUUID } from 'node:crypto';
import { ForbiddenError } from '@vitrina/plataforma/kernel';
import { AlsTenantContext, InMemoryEventSchemaValidator, OutboxPublisher, SystemClock, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import type { DependenciasCatalogos } from '../../src/application/dependencias-catalogos.js';
import { registrarEsquemasCat } from '../../src/infrastructure/event-schemas.js';
import { CatalogosRepositorioTypeOrm } from '../../src/infrastructure/typeorm/catalogos.repositorio.js';
import { ENTIDADES_CAT } from '../../src/infrastructure/typeorm/entidades.js';
import { ItemsRepositorioTypeOrm } from '../../src/infrastructure/typeorm/items.repositorio.js';
import { createTempDb, type TempDb } from './temp-db.js';

export class OperadorRequeridoDoble extends ForbiddenError {
  override readonly code = 'OPERADOR_REQUERIDO';
}

export interface Tenants {
  operador: string;
  cliente: string;
  usuarioId: string;
}

/** Pila real de los casos de uso de cat: base temporal con db/ aplicado, UoW, outbox y repositorios ORM. */
export interface EntornoCatalogos {
  dataSource: DataSource;
  dependencias: DependenciasCatalogos;
  tenants: Tenants;
  /** Ítems que el verificador de referencias doble da por usados. */
  referenciados: Set<string>;
  en<T>(tenantId: string, trabajo: () => Promise<T>): Promise<T>;
  eventosDe(agregadoId: string): Promise<Record<string, unknown>[]>;
  cerrar(): Promise<void>;
}

export async function crearEntornoCatalogos(): Promise<EntornoCatalogos> {
  const baseTemporal: TempDb = await createTempDb();
  const dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_CAT });
  await dataSource.initialize();
  const contexto = new AlsTenantContext();
  const unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
  const validador = new InMemoryEventSchemaValidator();
  registrarEsquemasCat(validador);
  const tenants = await sembrarTenants(dataSource);
  const referenciados = new Set<string>();

  const dependencias: DependenciasCatalogos = {
    unidadDeTrabajo,
    contexto,
    ids: { next: uuidV7 },
    reloj: new SystemClock(),
    eventos: new OutboxPublisher(unidadDeTrabajo, contexto, validador, { next: uuidV7 }),
    catalogos: new CatalogosRepositorioTypeOrm(unidadDeTrabajo),
    items: new ItemsRepositorioTypeOrm(unidadDeTrabajo),
    verificadorOperador: {
      exigir: async (tenantId) => {
        if (tenantId !== tenants.operador) throw new OperadorRequeridoDoble('Solo el tenant operador puede administrar catálogos globales');
      },
    },
    verificadoresReferencias: [{ estaReferenciado: async ({ itemId }) => referenciados.has(itemId) }],
  };

  return {
    dataSource,
    dependencias,
    tenants,
    referenciados,
    en: (tenantId, trabajo) => contexto.run({ tenantId }, trabajo),
    eventosDe: (agregadoId) =>
      dataSource.query(
        `SELECT tenant_id, event_type, aggregate_type, version, payload FROM sync.outbox WHERE aggregate_id = $1 ORDER BY occurred_at, version`,
        [agregadoId],
      ),
    cerrar: async () => {
      await dataSource.destroy();
      await baseTemporal.drop();
    },
  };
}

/** Inserta como superusuario (salta la RLS): el tenant operador, un cliente y un usuario. */
async function sembrarTenants(dataSource: DataSource): Promise<Tenants> {
  const tenants: Tenants = { operador: uuidV7(), cliente: uuidV7(), usuarioId: uuidV7() };
  const sufijo = randomUUID().slice(0, 8);
  await dataSource.query(
    `INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
       ($1, $3, 'Plataforma', 'ACTIVO', 1), ($2, $4, 'Clínica', 'ACTIVO', 1)`,
    [tenants.operador, tenants.cliente, `op-${sufijo}`, `cli-${sufijo}`],
  );
  await dataSource.query(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, $2, 'Ana', 'INTERNO', 'ACTIVO')`, [
    tenants.usuarioId,
    `ana.${sufijo}@gmail.com`,
  ]);
  return tenants;
}
