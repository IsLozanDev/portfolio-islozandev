import { Logger, Module, type DynamicModule, type OnModuleDestroy } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork, UNIT_OF_WORK } from '@vitrina/plataforma/kernel-infra';
import { CACHE_PERMISOS, PERMISOS_REPOSITORIO, type CachePermisos, type PermisosRepositorio } from './application/ports/permisos.port.js';
import { REGISTRO_ACCESO, type RegistroAcceso } from './application/ports/registro-acceso.port.js';
import { VERIFICADOR_TOKEN, type VerificadorToken } from './application/ports/verificador-token.port.js';
import { AutenticacionGuard } from './interface/autenticacion.guard.js';
import { MfaGuard } from './interface/mfa.guard.js';
import { MFA_MAX_EDAD_SEG, MiContextoController } from './interface/mi-contexto.controller.js';
import type { DataSource } from 'typeorm';
import { SupabaseJwksVerificador } from './infrastructure/supabase/supabase-jwks.verificador.js';
import { RegistroAccesoTypeorm } from './infrastructure/typeorm/registro-acceso.typeorm.js';
import { ResolverPermisos } from './application/resolver-permisos.js';
import { CachePermisosRedis, crearClienteRedis } from './infrastructure/redis/cache-permisos.redis.js';
import { PermisosSqlRepositorio } from './infrastructure/typeorm/permisos.sql.repositorio.js';
import { BitacoraSeguridadTypeOrm } from './infrastructure/typeorm/asignacion.repositorio.js';
import { CatalogoPermisosTypeOrm, MembresiasLecturaTypeOrm, ProductosContratadosTypeOrm } from './infrastructure/typeorm/lecturas.js';
import { PreferenciaSucursalTypeOrm } from './infrastructure/typeorm/preferencia-sucursal.repositorio.js';
import { ObtenerMiContexto } from './application/obtener-mi-contexto.js';
import { PermisoGuard } from './interface/permiso.guard.js';
import { AceptarInvitacion, ConsultarInvitacion } from './application/aceptar-invitacion.js';
import { InvitarPropietario } from './application/invitar-propietario.js';
import { InvitarUsuario } from './application/invitar-usuario.js';
import { FinalizarMembresia, ReactivarMembresia, RevocarAsignacion, SuspenderMembresia } from './application/membresia.casos-de-uso.js';
import { PROVEEDOR_IDENTIDAD, type ProveedorIdentidad } from './application/ports/proveedor-identidad.port.js';
import { SupabaseAdminProveedor } from './infrastructure/supabase/supabase-admin.proveedor.js';
import { AsignacionRepositorioTypeOrm, UbicacionesOrgTypeOrm } from './infrastructure/typeorm/asignacion.repositorio.js';
import { InvitacionRepositorioTypeOrm, LimitesPlanTypeOrm, MembresiaRepositorioTypeOrm, UsuariosIdentidadTypeOrm } from './infrastructure/typeorm/membresia.repositorio.js';
import { PerfilRepositorioTypeOrm } from './infrastructure/typeorm/perfil.repositorio.js';
import { RolRepositorioTypeOrm } from './infrastructure/typeorm/rol.repositorio.js';
import { InvitacionesController } from './interface/invitaciones.controller.js';
import { LIMITE_TASA, LimiteTasaGuard } from './interface/membresias.http.js';
import { MembresiasController } from './interface/membresias.controller.js';
import { MiembrosController } from './interface/miembros.controller.js';
import { AsignacionesController } from './interface/asignaciones.controller.js';
import { OtorgarAsignacion } from './application/otorgar-asignacion.js';
import { ConsultarMiembro, ListarAsignables, ListarMiembros } from './application/lecturas-miembros.js';
import { LecturaMiembrosTypeOrm } from './infrastructure/typeorm/lectura-miembros.typeorm.js';
import { ContextoTenantInterceptor } from './interface/contexto-tenant.interceptor.js';
import { AlcanceActorSeg } from './application/alcance-actor.js';
import { ALCANCE_ACTOR, type AlcanceActor } from './application/ports/alcance-actor.port.js';
import { PRODUCTOS_CONTRATADOS, type ProductosContratados } from './application/ports/repositorios.js';

const CLIENTE_REDIS = Symbol('CLIENTE_REDIS');

/** Cierra la conexión a Redis con la app (app.close() en pruebas y apagado). */
class CierreRedis implements OnModuleDestroy {
  constructor(private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

export interface SeguridadOpciones {
  supabaseUrl: string;
  mfaMaxEdadSeg: number;
  /** El mismo DataSource que recibe KernelInfraModule. */
  dataSource: DataSource;
  /** Caché de permisos efectivos (TR-RNF-101). Conecta con el primer uso. */
  redisUrl: string;
  /** Solo pruebas. */
  jwksUrl?: string;
  /** Solo pruebas. */
  enfriamientoMs?: number;
  /** Invitaciones (spec 08). */
  invitaciones: {
    /** Secret key de Supabase para la Admin API. Solo apps/api (regla 9). */
    supabaseSecretKey: string;
    /** Página de aceptación; recibe `?token=`. */
    url: string;
    /** Vigencia del token propio; 72 por defecto. */
    horas?: number;
    /** TR-RNF-015: peticiones por minuto y por IP a las rutas públicas de aceptar; 10 por defecto. */
    aceptarPorMinuto?: number;
  };
}

/** Repositorios sobre la UoW activa: los del spec 06 más los de membresías. */
function reposMembresias(uow: TypeOrmUnitOfWork, ctx: TenantContext, dataSource: DataSource) {
  return {
    ciclo: new MembresiaRepositorioTypeOrm(uow, ctx),
    membresias: new MembresiasLecturaTypeOrm(uow, ctx),
    invitaciones: new InvitacionRepositorioTypeOrm(uow, ctx, dataSource),
    usuarios: new UsuariosIdentidadTypeOrm(uow, ctx),
    limites: new LimitesPlanTypeOrm(uow, ctx),
    asignaciones: new AsignacionRepositorioTypeOrm(uow, ctx),
    roles: new RolRepositorioTypeOrm(uow, ctx),
    perfiles: new PerfilRepositorioTypeOrm(uow, ctx),
    catalogo: new CatalogoPermisosTypeOrm(uow, ctx),
    ubicaciones: new UbicacionesOrgTypeOrm(uow, ctx),
    bitacora: new BitacoraSeguridadTypeOrm(uow, ctx),
  };
}

const REPOS_MEMBRESIAS = Symbol('REPOS_MEMBRESIAS');
type ReposMembresias = ReturnType<typeof reposMembresias>;
type CasoDeCiclo<T> = new (uow: UnitOfWork, reloj: Clock, eventos: EventPublisher, repos: ReposMembresias) => T;

/** Los cuatro casos de uso de ciclo de vida tienen la misma firma. */
const ciclo = <T>(Clase: CasoDeCiclo<T>) => ({
  provide: Clase,
  useFactory: (uow: UnitOfWork, reloj: Clock, eventos: EventPublisher, repos: ReposMembresias) => new Clase(uow, reloj, eventos, repos),
  inject: [UNIT_OF_WORK, CLOCK, EVENT_PUBLISHER, REPOS_MEMBRESIAS],
});

// Usa los tokens de KernelInfraModule (global), que la app debe importar.
@Module({})
export class SeguridadModule {
  static register(op: SeguridadOpciones): DynamicModule {
    const logger = new Logger('Seguridad');
    const inv = op.invitaciones;
    return {
      module: SeguridadModule,
      // Global, como KernelInfraModule: los componentes que dependen de seg (cfg, seq, cat) inyectan sus puertos.
      global: true,
      controllers: [MiContextoController, InvitacionesController, MembresiasController, MiembrosController, AsignacionesController],
      providers: [
        { provide: LIMITE_TASA, useValue: { limite: inv.aceptarPorMinuto ?? 10, ventanaMs: 60_000 } },
        LimiteTasaGuard,
        {
          provide: REPOS_MEMBRESIAS,
          useFactory: (uow: TypeOrmUnitOfWork, ctx: TenantContext) => reposMembresias(uow, ctx, op.dataSource),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
        {
          provide: PROVEEDOR_IDENTIDAD,
          useFactory: (): ProveedorIdentidad => new SupabaseAdminProveedor({ url: op.supabaseUrl, secretKey: inv.supabaseSecretKey }),
        },
        {
          provide: InvitarUsuario,
          useFactory: (uow: UnitOfWork, ctx: TenantContext, ids: IdGenerator, reloj: Clock, eventos: EventPublisher, repos: ReposMembresias, proveedor: ProveedorIdentidad) =>
            new InvitarUsuario(uow, ctx, ids, reloj, eventos, repos, proveedor, { urlInvitacion: inv.url, horas: inv.horas ?? 72, mfaMaxEdadSeg: op.mfaMaxEdadSeg }),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, ID_GENERATOR, CLOCK, EVENT_PUBLISHER, REPOS_MEMBRESIAS, PROVEEDOR_IDENTIDAD],
        },
        {
          provide: InvitarPropietario,
          useFactory: (uow: UnitOfWork, ctx: TenantContext, ids: IdGenerator, reloj: Clock, eventos: EventPublisher, repos: ReposMembresias, proveedor: ProveedorIdentidad) =>
            new InvitarPropietario(uow, ctx, ids, reloj, eventos, repos, proveedor, { urlInvitacion: inv.url, horas: inv.horas ?? 72 }),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, ID_GENERATOR, CLOCK, EVENT_PUBLISHER, REPOS_MEMBRESIAS, PROVEEDOR_IDENTIDAD],
        },
        {
          provide: ConsultarInvitacion,
          useFactory: (repos: ReposMembresias, reloj: Clock) => new ConsultarInvitacion(repos.invitaciones, reloj),
          inject: [REPOS_MEMBRESIAS, CLOCK],
        },
        {
          provide: AceptarInvitacion,
          useFactory: (uow: UnitOfWork, ctx: TenantContext, reloj: Clock, eventos: EventPublisher, repos: ReposMembresias) =>
            new AceptarInvitacion(uow, ctx, reloj, eventos, repos),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, CLOCK, EVENT_PUBLISHER, REPOS_MEMBRESIAS],
        },
        // Para cfg y los demás componentes que dependen de seg (spec 09).
        { provide: ALCANCE_ACTOR, useFactory: (repositorios: ReposMembresias): AlcanceActor => new AlcanceActorSeg(repositorios), inject: [REPOS_MEMBRESIAS] },
        {
          provide: PRODUCTOS_CONTRATADOS,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext): ProductosContratados => new ProductosContratadosTypeOrm(unidadDeTrabajo, contexto),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
        {
          provide: OtorgarAsignacion,
          useFactory: (unidadDeTrabajo: UnitOfWork, contexto: TenantContext, ids: IdGenerator, reloj: Clock, eventos: EventPublisher, repositorios: ReposMembresias) =>
            new OtorgarAsignacion(unidadDeTrabajo, contexto, ids, reloj, eventos, repositorios, op.mfaMaxEdadSeg),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, ID_GENERATOR, CLOCK, EVENT_PUBLISHER, REPOS_MEMBRESIAS],
        },
        {
          provide: ListarMiembros,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock) =>
            new ListarMiembros({ unidadDeTrabajo, lectura: new LecturaMiembrosTypeOrm(unidadDeTrabajo, contexto), reloj }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK],
        },
        {
          provide: ConsultarMiembro,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock) =>
            new ConsultarMiembro({ unidadDeTrabajo, lectura: new LecturaMiembrosTypeOrm(unidadDeTrabajo, contexto), reloj }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK],
        },
        {
          provide: ListarAsignables,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, productos: ProductosContratados) =>
            new ListarAsignables({ unidadDeTrabajo, lectura: new LecturaMiembrosTypeOrm(unidadDeTrabajo, contexto), productos }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, PRODUCTOS_CONTRATADOS],
        },
        ciclo(SuspenderMembresia),
        ciclo(ReactivarMembresia),
        ciclo(FinalizarMembresia),
        ciclo(RevocarAsignacion),
        { provide: MFA_MAX_EDAD_SEG, useValue: op.mfaMaxEdadSeg },
        {
          provide: VERIFICADOR_TOKEN,
          useFactory: (): VerificadorToken =>
            new SupabaseJwksVerificador({
              emisor: `${op.supabaseUrl.replace(/\/$/, '')}/auth/v1`,
              jwksUrl: op.jwksUrl,
              enfriamientoMs: op.enfriamientoMs,
            }),
        },
        { provide: REGISTRO_ACCESO, useFactory: (): RegistroAcceso => new RegistroAccesoTypeorm(op.dataSource) },
        {
          provide: CLIENTE_REDIS,
          // Solo el nombre del error: el mensaje puede traer la URL con la clave (RNF-026).
          useFactory: (): Redis => crearClienteRedis(op.redisUrl, (e) => logger.warn({ evento: 'seg.redis.error', error: e.name })),
        },
        { provide: CierreRedis, useFactory: (r: Redis) => new CierreRedis(r), inject: [CLIENTE_REDIS] },
        { provide: CACHE_PERMISOS, useFactory: (r: Redis): CachePermisos => new CachePermisosRedis(r), inject: [CLIENTE_REDIS] },
        {
          provide: PERMISOS_REPOSITORIO,
          useFactory: (uow: TypeOrmUnitOfWork, ctx: TenantContext): PermisosRepositorio => new PermisosSqlRepositorio(uow, ctx),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
        {
          provide: ResolverPermisos,
          useFactory: (uow: UnitOfWork, ctx: TenantContext, repo: PermisosRepositorio, cache: CachePermisos) =>
            new ResolverPermisos(uow, ctx, repo, cache, (mensaje, datos) => logger.warn({ mensaje, ...datos })),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, PERMISOS_REPOSITORIO, CACHE_PERMISOS],
        },
        {
          provide: ObtenerMiContexto,
          useFactory: (uow: TypeOrmUnitOfWork, ctx: TenantContext, repo: PermisosRepositorio, resolver: ResolverPermisos) =>
            new ObtenerMiContexto(uow, ctx, repo, new MembresiasLecturaTypeOrm(uow, ctx), new PreferenciaSucursalTypeOrm(uow, ctx), resolver, (mensaje, datos) =>
              logger.warn({ mensaje, ...datos }),
            ),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, PERMISOS_REPOSITORIO, ResolverPermisos],
        },
        // APP_GUARD se ejecuta en el orden de registro: autenticación, MFA y permiso.
        {
          provide: APP_GUARD,
          useFactory: (r: Reflector, v: VerificadorToken, a: RegistroAcceso) => new AutenticacionGuard(r, v, a),
          inject: [Reflector, VERIFICADOR_TOKEN, REGISTRO_ACCESO],
        },
        { provide: APP_GUARD, useFactory: (r: Reflector) => new MfaGuard(r, op.mfaMaxEdadSeg), inject: [Reflector] },
        {
          provide: APP_GUARD,
          useFactory: (r: Reflector, resolver: ResolverPermisos, uow: TypeOrmUnitOfWork, ctx: TenantContext) =>
            new PermisoGuard(r, resolver, new CatalogoPermisosTypeOrm(uow, ctx), new BitacoraSeguridadTypeOrm(uow, ctx), uow, ctx, op.mfaMaxEdadSeg),
          inject: [Reflector, ResolverPermisos, TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
        { provide: APP_INTERCEPTOR, useFactory: (ctx: TenantContext) => new ContextoTenantInterceptor(ctx), inject: [TENANT_CONTEXT] },
      ],
      exports: [VERIFICADOR_TOKEN, ResolverPermisos, ALCANCE_ACTOR, PRODUCTOS_CONTRATADOS, InvitarPropietario],
    };
  }
}
