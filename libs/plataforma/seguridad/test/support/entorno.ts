import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AlsTenantContext, InMemoryEventSchemaValidator, OutboxPublisher, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { registrarEsquemasSeg } from '../../src/infrastructure/event-schemas.js';
import { CatalogoPermisosTypeOrm, MembresiasLecturaTypeOrm, ProductosContratadosTypeOrm } from '../../src/infrastructure/typeorm/lecturas.js';
import { PerfilRepositorioTypeOrm } from '../../src/infrastructure/typeorm/perfil.repositorio.js';
import { RolRepositorioTypeOrm } from '../../src/infrastructure/typeorm/rol.repositorio.js';
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
    roles: RolRepositorioTypeOrm;
    perfiles: PerfilRepositorioTypeOrm;
    catalogo: CatalogoPermisosTypeOrm;
    productos: ProductosContratadosTypeOrm;
    membresias: MembresiasLecturaTypeOrm;
  };
  /** Ejecuta `fn` con el tenant en el contexto, como lo hará el interceptor HTTP. */
  en<T>(tenantId: string, fn: () => Promise<T>): Promise<T>;
  /** [event_type, version] en el outbox para un agregado, en orden. */
  eventosDe(aggregateId: string): Promise<[string, number][]>;
  sembrar: Semilla;
  cerrar(): Promise<void>;
}

/** Inserta como superusuario (salta la RLS): datos de partida de cada prueba. */
export interface Semilla {
  tenant(): Promise<string>;
  suscripcion(tenantId: string, producto: string, estado?: 'PRUEBA' | 'ACTIVA' | 'VENCIDA' | 'CANCELADA'): Promise<void>;
  permiso(codigo: string, cambios?: { alcanceMinimo?: string; sensible?: boolean; obsoleto?: boolean }): Promise<void>;
  rol(tenantId: string | null, producto: string, codigo: string, permisos: string[]): Promise<string>;
  perfil(tenantId: string, codigo: string, roles: string[]): Promise<string>;
  membresia(tenantId: string, estado?: 'INVITADO' | 'ACTIVO' | 'SUSPENDIDO', esPropietario?: boolean): Promise<{ membresiaId: string; usuarioId: string }>;
  asignacion(tenantId: string, membresiaId: string, destino: { rolId?: string; perfilId?: string }, vigencia?: { desde?: string; hasta?: string | null }): Promise<string>;
}

const PRODUCTOS = ['PLAT', 'REST', 'GYM', 'LIB', 'ECO', 'CLI'];

export async function crearEntorno(): Promise<Entorno> {
  const db = await createTempDb();
  const dataSource = new DataSource({ type: 'postgres', url: db.url });
  await dataSource.initialize();
  const contexto = new AlsTenantContext();
  const uow = new TypeOrmUnitOfWork(dataSource, contexto);
  const validator = new InMemoryEventSchemaValidator();
  registrarEsquemasSeg(validator);
  const ids = { next: uuidV7 };
  const q = (sql: string, params: unknown[] = []) => dataSource.query(sql, params);

  await q(`INSERT INTO seg.producto (codigo, nombre) SELECT c, c FROM unnest($1::varchar[]) c`, [PRODUCTOS]);

  let n = 0;
  const sembrar: Semilla = {
    tenant: async () => {
      const id = uuidV7();
      await q(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $2, 'Tenant de prueba', 'ACTIVO', 1)`, [id, `t-${++n}-${id.slice(-8)}`]);
      return id;
    },
    suscripcion: async (tenantId, producto, estado = 'ACTIVA') => {
      await q(`INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, version) VALUES ($1, $2, $3, 'PRO', $4, 1)`, [
        uuidV7(),
        tenantId,
        producto,
        estado,
      ]);
    },
    permiso: async (codigo, c = {}) => {
      await q(
        `INSERT INTO seg.permiso (codigo, producto_codigo, descripcion, alcance_minimo, sensible, obsoleto)
         VALUES ($1, $2, $1, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [codigo, codigo.split('.')[0].toUpperCase(), c.alcanceMinimo ?? 'UNIDAD', c.sensible ?? false, c.obsoleto ?? false],
      );
    },
    rol: async (tenantId, producto, codigo, permisos) => {
      const id = uuidV7();
      await q(`INSERT INTO seg.rol (id, tenant_id, producto_codigo, codigo, nombre, editable, version) VALUES ($1, $2, $3, $4, $4, $5, 1)`, [
        id,
        tenantId,
        producto,
        codigo,
        tenantId !== null,
      ]);
      await q(`INSERT INTO seg.rol_permiso (rol_id, permiso_codigo) SELECT $1, unnest($2::varchar[])`, [id, permisos]);
      return id;
    },
    perfil: async (tenantId, codigo, roles) => {
      const id = uuidV7();
      await q(`INSERT INTO seg.perfil (id, tenant_id, codigo, nombre, version) VALUES ($1, $2, $3, $3, 1)`, [id, tenantId, codigo]);
      await q(`INSERT INTO seg.perfil_rol (perfil_id, rol_id) SELECT $1, unnest($2::uuid[])`, [id, roles]);
      return id;
    },
    membresia: async (tenantId, estado = 'ACTIVO', esPropietario = false) => {
      const usuarioId = uuidV7();
      const membresiaId = uuidV7();
      await q(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, $2, 'Usuario', 'EXTERNO', 'ACTIVO')`, [
        usuarioId,
        `u-${randomUUID()}@prueba.pe`,
      ]);
      await q(`INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado, es_propietario) VALUES ($1, $2, $3, $4, $5)`, [
        membresiaId,
        usuarioId,
        tenantId,
        estado,
        esPropietario,
      ]);
      return { membresiaId, usuarioId };
    },
    asignacion: async (tenantId, membresiaId, { rolId, perfilId }, vigencia = {}) => {
      const id = uuidV7();
      await q(
        `INSERT INTO seg.asignacion (id, tenant_id, membresia_id, rol_id, perfil_id, alcance, vigente_desde, vigente_hasta)
         VALUES ($1, $2, $3, $4, $5, 'TENANT', COALESCE($6::date, current_date), $7::date)`,
        [id, tenantId, membresiaId, rolId ?? null, perfilId ?? null, vigencia.desde ?? null, vigencia.hasta ?? null],
      );
      return id;
    },
  };

  return {
    db,
    dataSource,
    contexto,
    uow,
    eventos: new OutboxPublisher(uow, contexto, validator, ids),
    ids,
    repos: {
      roles: new RolRepositorioTypeOrm(uow, contexto),
      perfiles: new PerfilRepositorioTypeOrm(uow, contexto),
      catalogo: new CatalogoPermisosTypeOrm(uow, contexto),
      productos: new ProductosContratadosTypeOrm(uow, contexto),
      membresias: new MembresiasLecturaTypeOrm(uow, contexto),
    },
    en: (tenantId, fn) => contexto.run({ tenantId }, fn),
    eventosDe: async (aggregateId) =>
      (await q('SELECT event_type, version FROM sync.outbox WHERE aggregate_id = $1 ORDER BY seq', [aggregateId])).map(
        (f: { event_type: string; version: string }) => [f.event_type, Number(f.version)],
      ),
    sembrar,
    cerrar: async () => {
      await dataSource.destroy();
      await db.drop();
    },
  };
}
