import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AlsTenantContext, InMemoryEventSchemaValidator, OutboxPublisher, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { Ambito } from '../../src/domain/alcance.js';
import { registrarEsquemasSeg } from '../../src/infrastructure/event-schemas.js';
import { AsignacionRepositorioTypeOrm, BitacoraSeguridadTypeOrm, UbicacionesOrgTypeOrm } from '../../src/infrastructure/typeorm/asignacion.repositorio.js';
import { CatalogoPermisosTypeOrm, MembresiasLecturaTypeOrm, ProductosContratadosTypeOrm } from '../../src/infrastructure/typeorm/lecturas.js';
import {
  InvitacionRepositorioTypeOrm,
  LimitesPlanTypeOrm,
  MembresiaRepositorioTypeOrm,
  UsuariosIdentidadTypeOrm,
} from '../../src/infrastructure/typeorm/membresia.repositorio.js';
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
    asignaciones: AsignacionRepositorioTypeOrm;
    ubicaciones: UbicacionesOrgTypeOrm;
    bitacora: BitacoraSeguridadTypeOrm;
    ciclo: MembresiaRepositorioTypeOrm;
    invitaciones: InvitacionRepositorioTypeOrm;
    usuarios: UsuariosIdentidadTypeOrm;
    limites: LimitesPlanTypeOrm;
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
  suscripcion(tenantId: string, producto: string, estado?: 'PRUEBA' | 'ACTIVA' | 'VENCIDA' | 'CANCELADA', limiteUsuarios?: number | null): Promise<void>;
  permiso(codigo: string, cambios?: { alcanceMinimo?: string; sensible?: boolean; obsoleto?: boolean }): Promise<void>;
  rol(tenantId: string | null, producto: string, codigo: string, permisos: string[]): Promise<string>;
  perfil(tenantId: string, codigo: string, roles: string[]): Promise<string>;
  membresia(
    tenantId: string,
    estado?: 'INVITADO' | 'ACTIVO' | 'SUSPENDIDO' | 'FINALIZADO',
    esPropietario?: boolean,
  ): Promise<{ membresiaId: string; usuarioId: string }>;
  /** Invitación pendiente que expira en `expiraEn` (por defecto, en 72 h). */
  invitacion(tenantId: string, membresiaId: string, creadaPor: string, expiraEn?: Date): Promise<string>;
  asignacion(
    tenantId: string,
    membresiaId: string,
    destino: { rolId?: string; perfilId?: string },
    vigencia?: { desde?: string; hasta?: string | null },
    ambito?: Partial<Ambito>,
  ): Promise<string>;
  /** Empresa con dos sucursales (la primera principal) y una caja en cada una. */
  organizacion(tenantId: string): Promise<{ empresaId: string; sucursales: [string, string]; cajas: [string, string] }>;
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
    suscripcion: async (tenantId, producto, estado = 'ACTIVA', limiteUsuarios = null) => {
      await q(
        `INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, limite_usuarios, version) VALUES ($1, $2, $3, 'PRO', $4, $5, 1)`,
        [uuidV7(), tenantId, producto, estado, limiteUsuarios],
      );
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
      // FINALIZADO necesita `hasta` posterior a `desde` (ck_membresia_vigencia).
      await q(
        `INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado, es_propietario, desde, hasta)
         VALUES ($1, $2, $3, $4::varchar, $5, now() - interval '1 day', CASE WHEN $4::varchar = 'FINALIZADO' THEN now() END)`,
        [membresiaId, usuarioId, tenantId, estado, esPropietario],
      );
      return { membresiaId, usuarioId };
    },
    invitacion: async (tenantId, membresiaId, creadaPor, expiraEn = new Date(Date.now() + 72 * 3_600_000)) => {
      const id = uuidV7();
      await q(
        `INSERT INTO seg.invitacion (id, tenant_id, membresia_id, token_hash, expira_en, creada_por)
         VALUES ($1::uuid, $2, $3, encode(sha256(convert_to($1::uuid::text, 'UTF8')), 'hex'), $4, $5)`,
        [id, tenantId, membresiaId, expiraEn, creadaPor],
      );
      return id;
    },
    asignacion: async (tenantId, membresiaId, { rolId, perfilId }, vigencia = {}, ambito = {}) => {
      const id = uuidV7();
      // Desde ayer: current_date es UTC y los casos de uso miden la vigencia con la fecha de Lima.
      await q(
        `INSERT INTO seg.asignacion (id, tenant_id, membresia_id, rol_id, perfil_id, alcance, empresa_id, sucursal_id, unidad_id,
           vigente_desde, vigente_hasta)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, current_date - 1), $11::date)`,
        [
          id,
          tenantId,
          membresiaId,
          rolId ?? null,
          perfilId ?? null,
          ambito.alcance ?? 'TENANT',
          ambito.empresaId ?? null,
          ambito.sucursalId ?? null,
          ambito.unidadId ?? null,
          vigencia.desde ?? null,
          vigencia.hasta ?? null,
        ],
      );
      return id;
    },
    organizacion: async (tenantId) => {
      const empresaId = uuidV7();
      const sucursales: [string, string] = [uuidV7(), uuidV7()];
      const cajas: [string, string] = [uuidV7(), uuidV7()];
      const ruc = `20${String(++n).padStart(9, '0')}`;
      await q(`INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ($1, $2, $3, 'Sabores del Sur SAC', 1)`, [empresaId, tenantId, ruc]);
      await q(
        `INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version) VALUES
           ($1, $3, $4, 'MIRAFLORES', 'Miraflores', '0000', true, 1), ($2, $3, $4, 'SURCO', 'Surco', NULL, false, 1)`,
        [...sucursales, tenantId, empresaId],
      );
      await q(
        `INSERT INTO org.unidad_operativa (id, tenant_id, empresa_id, sucursal_id, tipo, codigo, nombre, version) VALUES
           ($1, $3, $4, $5, 'CAJA', 'CAJA-02', 'Caja 02', 1), ($2, $3, $4, $6, 'CAJA', 'CAJA-01', 'Caja 01', 1)`,
        [...cajas, tenantId, empresaId, ...sucursales],
      );
      return { empresaId, sucursales, cajas };
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
      asignaciones: new AsignacionRepositorioTypeOrm(uow, contexto),
      ubicaciones: new UbicacionesOrgTypeOrm(uow, contexto),
      bitacora: new BitacoraSeguridadTypeOrm(uow, contexto),
      ciclo: new MembresiaRepositorioTypeOrm(uow, contexto),
      invitaciones: new InvitacionRepositorioTypeOrm(uow, contexto, dataSource),
      usuarios: new UsuariosIdentidadTypeOrm(uow, contexto),
      limites: new LimitesPlanTypeOrm(uow, contexto),
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
