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
import { OrigenPeticion } from './infrastructure/origen-peticion.js';
import { OrigenPeticionInterceptor } from './interface/origen-peticion.interceptor.js';
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
import { ConsultarBitacora, ConsultarEventoSeguridad } from './application/lecturas-bitacora.js';
import { LecturaBitacoraTypeOrm } from './infrastructure/typeorm/lectura-bitacora.typeorm.js';
import { BitacoraController } from './interface/bitacora.controller.js';
import { ExportarBitacora } from './application/exportar-bitacora.js';
import { FABRICA_ESCRITOR_BITACORA, type FabricaEscritorBitacora } from './application/ports/escritor-bitacora.port.js';
import { EscritorBitacoraXlsx } from './infrastructure/xlsx/escritor-bitacora.xlsx.js';
import { ListarMisAccesosSoporte, SolicitarAccesoSoporte } from './application/solicitar-acceso-soporte.js';
import { AprobarAccesoSoporte } from './application/aprobar-acceso-soporte.js';
import { RechazarAccesoSoporte, RevocarAccesoSoporte, RevocarAccesosPorTicket, type DependenciasCierreSoporte } from './application/cerrar-acceso-soporte.js';
import { ContarSolicitudesPendientes, ListarSolicitudesSoporte } from './application/lecturas-soporte.js';
import { ResolverAccesoSoporteVigente } from './application/resolver-acceso-soporte.js';
import { RegistrarPeticionSoporte } from './application/registrar-peticion-soporte.js';
import { SoporteInterceptor } from './interface/soporte.interceptor.js';
import { EntrarComoSoporte, SalirDeSoporte, type DependenciasSesionSoporte } from './application/sesion-soporte.js';
import { VERIFICADOR_TICKET, type VerificadorTicket } from './application/ports/verificador-ticket.port.js';
import { AccesoSoporteRepositorioTypeOrm } from './infrastructure/typeorm/acceso-soporte.repositorio.js';
import { LecturaSoporteTypeOrm } from './infrastructure/typeorm/lectura-soporte.typeorm.js';
import { TenantsSoporteTypeOrm } from './infrastructure/typeorm/tenants-soporte.typeorm.js';
import { VerificadorTicketPorFormato } from './infrastructure/verificador-ticket.formato.js';
import { SoporteController } from './interface/soporte.controller.js';
import { ContextoTenantInterceptor } from './interface/contexto-tenant.interceptor.js';
import { AlcanceActorSeg } from './application/alcance-actor.js';
import { ALCANCE_ACTOR, type AlcanceActor } from './application/ports/alcance-actor.port.js';
import { DIRECTORIO_SEG, type DirectorioSeg } from './application/ports/directorio-seg.port.js';
import { DirectorioSegTypeOrm } from './infrastructure/typeorm/directorio-seg.typeorm.js';
import { PRODUCTOS_CONTRATADOS, type ProductosContratados } from './application/ports/repositorios.js';
import { CambiarPermisosRol, CopiarRol, CrearRol, InactivarRol } from './application/rol.casos-de-uso.js';
import { ConsultarCatalogo, ConsultarRol, ListarProductosDisponibles, ListarRoles, type DependenciasLecturaRoles } from './application/lecturas-roles.js';
import { LecturaRolesTypeOrm } from './infrastructure/typeorm/lectura-roles.typeorm.js';
import { RolesController } from './interface/roles.controller.js';
import { CatalogoController } from './interface/catalogo.controller.js';
import { CambiarRolesPerfil, CopiarPerfil, CrearPerfil } from './application/perfil.casos-de-uso.js';
import { ConsultarPerfil, ListarPerfiles, ListarRolesDisponibles, type DependenciasLecturaPerfiles } from './application/lecturas-perfiles.js';
import { LecturaPerfilesTypeOrm } from './infrastructure/typeorm/lectura-perfiles.typeorm.js';
import { PerfilesController } from './interface/perfiles.controller.js';
import { IngresarConClave, type DependenciasIngreso } from './application/ingresar-con-clave.js';
import { VerificarMfa } from './application/verificar-mfa.js';
import type { ProveedorIngreso } from './application/ports/proveedor-ingreso.port.js';
import { ProveedorIngresoNoDisponibleError } from './domain/errores.js';
import { ProveedorIngresoGotrue } from './infrastructure/supabase/proveedor-ingreso.gotrue.js';
import { ContadorIntentosRedis, type AlFallarRedis } from './infrastructure/redis/contador-intentos.redis.js';
import { BitacoraIngresoTypeorm } from './infrastructure/typeorm/bitacora-ingreso.typeorm.js';
import { IngresoController } from './interface/ingreso.controller.js';
import { RegistrarInicioSesion } from './application/registrar-inicio-sesion.js';
import { RegistroSesionesRedis } from './infrastructure/redis/registro-sesiones.redis.js';

const CLIENTE_REDIS = Symbol('CLIENTE_REDIS');
const DEPENDENCIAS_INGRESO = Symbol('DEPENDENCIAS_INGRESO');

/** Sin publishable key no hay con qué hablar con Supabase Auth: el ingreso queda como no disponible. */
const PROVEEDOR_INGRESO_SIN_CONFIGURAR: ProveedorIngreso = {
  conClave: () => Promise.reject(new ProveedorIngresoNoDisponibleError()),
  verificarMfa: () => Promise.reject(new ProveedorIngresoNoDisponibleError()),
};

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
  /** Código del tenant operador (ORG_TENANT_OPERADOR): el único que solicita soporte (spec 18). Por defecto, `plataforma`. */
  tenantOperador?: string;
  /**
   * Ingreso con contraseña y MFA por la API (spec 18b). La api la exige (SUPABASE_PUBLISHABLE_KEY); sin
   * ella, `/seg/auth` responde INGRESO_NO_DISPONIBLE.
   */
  ingreso?: { supabasePublishableKey: string };
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
function reposMembresias(uow: TypeOrmUnitOfWork, ctx: TenantContext, dataSource: DataSource, origen: OrigenPeticion) {
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
    bitacora: new BitacoraSeguridadTypeOrm(uow, ctx, origen),
    accesosSoporte: new AccesoSoporteRepositorioTypeOrm(uow, ctx),
    lecturaSoporte: new LecturaSoporteTypeOrm(uow, ctx, dataSource),
    tenantsSoporte: new TenantsSoporteTypeOrm(uow, dataSource),
  };
}

const REPOS_MEMBRESIAS = Symbol('REPOS_MEMBRESIAS');
const ORIGEN_PETICION = Symbol('ORIGEN_PETICION');
const TENANT_OPERADOR_DEFECTO = 'plataforma';
const DEPENDENCIAS_CIERRE_SOPORTE = Symbol('DEPENDENCIAS_CIERRE_SOPORTE');
const DEPENDENCIAS_SESION_SOPORTE = Symbol('DEPENDENCIAS_SESION_SOPORTE');
type CasoDeCierreDeSoporte<T> = new (dependencias: DependenciasCierreSoporte) => T;

/** Rechazar, revocar y cerrar por ticket reciben las mismas dependencias (spec 18). */
const cierreDeSoporte = <T>(Clase: CasoDeCierreDeSoporte<T>) => ({
  provide: Clase,
  useFactory: (dependencias: DependenciasCierreSoporte) => new Clase(dependencias),
  inject: [DEPENDENCIAS_CIERRE_SOPORTE],
});
type ReposMembresias = ReturnType<typeof reposMembresias>;
const DEPENDENCIAS_LECTURA_ROLES = Symbol('DEPENDENCIAS_LECTURA_ROLES');
const DEPENDENCIAS_LECTURA_PERFILES = Symbol('DEPENDENCIAS_LECTURA_PERFILES');
type CasoDeLecturaDeRoles<T> = new (dependencias: DependenciasLecturaRoles) => T;

/** Los cuatro casos de uso de lectura de roles reciben las mismas dependencias (spec 16b). */
const lecturaDeRoles = <T>(Clase: CasoDeLecturaDeRoles<T>) => ({
  provide: Clase,
  useFactory: (dependencias: DependenciasLecturaRoles) => new Clase(dependencias),
  inject: [DEPENDENCIAS_LECTURA_ROLES],
});
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
    // Solo la operación y el nombre del error: ni correo ni IP (TR-RNF-026).
    const alFallarRedis: AlFallarRedis = (operacion, error) =>
      logger.warn({ evento: 'seg.ingreso.redis_error', operacion, error: error instanceof Error ? error.name : typeof error });
    return {
      module: SeguridadModule,
      // Global, como KernelInfraModule: los componentes que dependen de seg (cfg, seq, cat) inyectan sus puertos.
      global: true,
      controllers: [MiContextoController, InvitacionesController, MembresiasController, MiembrosController, AsignacionesController, RolesController, CatalogoController, PerfilesController, BitacoraController, SoporteController, IngresoController],
      providers: [
        { provide: ORIGEN_PETICION, useValue: new OrigenPeticion() },
        { provide: LIMITE_TASA, useValue: { limite: inv.aceptarPorMinuto ?? 10, ventanaMs: 60_000 } },
        LimiteTasaGuard,
        {
          provide: REPOS_MEMBRESIAS,
          useFactory: (uow: TypeOrmUnitOfWork, ctx: TenantContext, origen: OrigenPeticion) => reposMembresias(uow, ctx, op.dataSource, origen),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, ORIGEN_PETICION],
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
        // Nombres de personas y sucursales para auditoría (spec 20b).
        {
          provide: DIRECTORIO_SEG,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext): DirectorioSeg => new DirectorioSegTypeOrm(unidadDeTrabajo, contexto),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
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
        { provide: VERIFICADOR_TICKET, useClass: VerificadorTicketPorFormato },
        {
          provide: SolicitarAccesoSoporte,
          useFactory: (
            unidadDeTrabajo: UnitOfWork,
            contexto: TenantContext,
            ids: IdGenerator,
            reloj: Clock,
            eventos: EventPublisher,
            repositorios: ReposMembresias,
            verificador: VerificadorTicket,
          ) =>
            new SolicitarAccesoSoporte({
              unidadDeTrabajo,
              contexto,
              ids,
              reloj,
              eventos,
              accesos: repositorios.accesosSoporte,
              membresias: repositorios.ciclo,
              bitacora: repositorios.bitacora,
              tenants: repositorios.tenantsSoporte,
              verificador,
              tenantOperador: op.tenantOperador ?? TENANT_OPERADOR_DEFECTO,
            }),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, ID_GENERATOR, CLOCK, EVENT_PUBLISHER, REPOS_MEMBRESIAS, VERIFICADOR_TICKET],
        },
        {
          provide: DEPENDENCIAS_CIERRE_SOPORTE,
          useFactory: (unidadDeTrabajo: UnitOfWork, contexto: TenantContext, reloj: Clock, eventos: EventPublisher, repositorios: ReposMembresias): DependenciasCierreSoporte => ({
            unidadDeTrabajo,
            contexto,
            reloj,
            eventos,
            accesos: repositorios.accesosSoporte,
            membresias: repositorios.ciclo,
            asignaciones: repositorios.asignaciones,
            bitacora: repositorios.bitacora,
          }),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, CLOCK, EVENT_PUBLISHER, REPOS_MEMBRESIAS],
        },
        cierreDeSoporte(RechazarAccesoSoporte),
        cierreDeSoporte(RevocarAccesoSoporte),
        cierreDeSoporte(RevocarAccesosPorTicket),
        {
          provide: AprobarAccesoSoporte,
          useFactory: (unidadDeTrabajo: UnitOfWork, contexto: TenantContext, ids: IdGenerator, reloj: Clock, eventos: EventPublisher, repositorios: ReposMembresias) =>
            new AprobarAccesoSoporte({
              unidadDeTrabajo,
              contexto,
              ids,
              reloj,
              eventos,
              accesos: repositorios.accesosSoporte,
              membresias: repositorios.ciclo,
              asignaciones: repositorios.asignaciones,
              roles: repositorios.roles,
              perfiles: repositorios.perfiles,
              catalogo: repositorios.catalogo,
              bitacora: repositorios.bitacora,
            }),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, ID_GENERATOR, CLOCK, EVENT_PUBLISHER, REPOS_MEMBRESIAS],
        },
        {
          provide: ListarSolicitudesSoporte,
          useFactory: (unidadDeTrabajo: UnitOfWork, repositorios: ReposMembresias) => new ListarSolicitudesSoporte({ unidadDeTrabajo, lectura: repositorios.lecturaSoporte }),
          inject: [UNIT_OF_WORK, REPOS_MEMBRESIAS],
        },
        {
          provide: ContarSolicitudesPendientes,
          useFactory: (unidadDeTrabajo: UnitOfWork, reloj: Clock, repositorios: ReposMembresias) =>
            new ContarSolicitudesPendientes({ unidadDeTrabajo, lectura: repositorios.lecturaSoporte, reloj }),
          inject: [UNIT_OF_WORK, CLOCK, REPOS_MEMBRESIAS],
        },
        {
          provide: ListarMisAccesosSoporte,
          useFactory: (repositorios: ReposMembresias) => new ListarMisAccesosSoporte(repositorios.lecturaSoporte),
          inject: [REPOS_MEMBRESIAS],
        },
        {
          provide: ConsultarBitacora,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext) =>
            new ConsultarBitacora({ unidadDeTrabajo, lectura: new LecturaBitacoraTypeOrm(unidadDeTrabajo, contexto) }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
        {
          provide: ConsultarEventoSeguridad,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext) =>
            new ConsultarEventoSeguridad({ unidadDeTrabajo, lectura: new LecturaBitacoraTypeOrm(unidadDeTrabajo, contexto) }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
        {
          provide: ExportarBitacora,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, repositorios: ReposMembresias) =>
            new ExportarBitacora({
              unidadDeTrabajo,
              lectura: new LecturaBitacoraTypeOrm(unidadDeTrabajo, contexto),
              bitacora: repositorios.bitacora,
              avisar: (mensaje, datos) => logger.error({ evento: mensaje, ...datos }),
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, REPOS_MEMBRESIAS],
        },
        { provide: FABRICA_ESCRITOR_BITACORA, useValue: ((destino) => new EscritorBitacoraXlsx(destino)) satisfies FabricaEscritorBitacora },
        {
          provide: ListarAsignables,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, productos: ProductosContratados) =>
            new ListarAsignables({ unidadDeTrabajo, lectura: new LecturaMiembrosTypeOrm(unidadDeTrabajo, contexto), productos }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, PRODUCTOS_CONTRATADOS],
        },
        // Roles (spec 16b): escritura del spec 06 y lecturas nuevas.
        {
          provide: CrearRol,
          useFactory: (unidadDeTrabajo: UnitOfWork, contexto: TenantContext, ids: IdGenerator, eventos: EventPublisher, repositorios: ReposMembresias, productos: ProductosContratados) =>
            new CrearRol(unidadDeTrabajo, contexto, ids, eventos, { ...repositorios, productos }),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, ID_GENERATOR, EVENT_PUBLISHER, REPOS_MEMBRESIAS, PRODUCTOS_CONTRATADOS],
        },
        {
          provide: CopiarRol,
          useFactory: (unidadDeTrabajo: UnitOfWork, contexto: TenantContext, ids: IdGenerator, eventos: EventPublisher, repositorios: ReposMembresias, productos: ProductosContratados) =>
            new CopiarRol(unidadDeTrabajo, contexto, ids, eventos, { ...repositorios, productos }),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, ID_GENERATOR, EVENT_PUBLISHER, REPOS_MEMBRESIAS, PRODUCTOS_CONTRATADOS],
        },
        {
          provide: CambiarPermisosRol,
          useFactory: (unidadDeTrabajo: UnitOfWork, eventos: EventPublisher, repositorios: ReposMembresias) => new CambiarPermisosRol(unidadDeTrabajo, eventos, repositorios),
          inject: [UNIT_OF_WORK, EVENT_PUBLISHER, REPOS_MEMBRESIAS],
        },
        {
          provide: InactivarRol,
          useFactory: (unidadDeTrabajo: UnitOfWork, eventos: EventPublisher, repositorios: ReposMembresias) => new InactivarRol(unidadDeTrabajo, eventos, repositorios.roles),
          inject: [UNIT_OF_WORK, EVENT_PUBLISHER, REPOS_MEMBRESIAS],
        },
        {
          provide: DEPENDENCIAS_LECTURA_ROLES,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, productos: ProductosContratados): DependenciasLecturaRoles => ({
            unidadDeTrabajo,
            lectura: new LecturaRolesTypeOrm(unidadDeTrabajo, contexto),
            productos,
            catalogo: new CatalogoPermisosTypeOrm(unidadDeTrabajo, contexto),
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, PRODUCTOS_CONTRATADOS],
        },
        lecturaDeRoles(ListarRoles),
        lecturaDeRoles(ConsultarRol),
        lecturaDeRoles(ConsultarCatalogo),
        lecturaDeRoles(ListarProductosDisponibles),
        // Perfiles (spec 16c): escritura del spec 06 más la copia, y lecturas nuevas.
        {
          provide: CrearPerfil,
          useFactory: (unidadDeTrabajo: UnitOfWork, contexto: TenantContext, ids: IdGenerator, eventos: EventPublisher, repositorios: ReposMembresias, productos: ProductosContratados) =>
            new CrearPerfil(unidadDeTrabajo, contexto, ids, eventos, { ...repositorios, productos }),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, ID_GENERATOR, EVENT_PUBLISHER, REPOS_MEMBRESIAS, PRODUCTOS_CONTRATADOS],
        },
        {
          provide: CopiarPerfil,
          useFactory: (unidadDeTrabajo: UnitOfWork, contexto: TenantContext, ids: IdGenerator, eventos: EventPublisher, repositorios: ReposMembresias, productos: ProductosContratados) =>
            new CopiarPerfil(unidadDeTrabajo, contexto, ids, eventos, { ...repositorios, productos }),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, ID_GENERATOR, EVENT_PUBLISHER, REPOS_MEMBRESIAS, PRODUCTOS_CONTRATADOS],
        },
        {
          provide: CambiarRolesPerfil,
          useFactory: (unidadDeTrabajo: UnitOfWork, eventos: EventPublisher, repositorios: ReposMembresias, productos: ProductosContratados) =>
            new CambiarRolesPerfil(unidadDeTrabajo, eventos, { ...repositorios, productos }),
          inject: [UNIT_OF_WORK, EVENT_PUBLISHER, REPOS_MEMBRESIAS, PRODUCTOS_CONTRATADOS],
        },
        {
          provide: DEPENDENCIAS_LECTURA_PERFILES,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext): DependenciasLecturaPerfiles => ({
            unidadDeTrabajo,
            lectura: new LecturaPerfilesTypeOrm(unidadDeTrabajo, contexto),
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
        { provide: ListarPerfiles, useFactory: (dependencias: DependenciasLecturaPerfiles) => new ListarPerfiles(dependencias), inject: [DEPENDENCIAS_LECTURA_PERFILES] },
        { provide: ConsultarPerfil, useFactory: (dependencias: DependenciasLecturaPerfiles) => new ConsultarPerfil(dependencias), inject: [DEPENDENCIAS_LECTURA_PERFILES] },
        { provide: ListarRolesDisponibles, useFactory: (listarRoles: ListarRoles) => new ListarRolesDisponibles(listarRoles), inject: [ListarRoles] },
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
        {
          provide: DEPENDENCIAS_INGRESO,
          useFactory: (redis: Redis): DependenciasIngreso => {
            const proveedor = op.ingreso
              ? new ProveedorIngresoGotrue(op.supabaseUrl, op.ingreso.supabasePublishableKey)
              : PROVEEDOR_INGRESO_SIN_CONFIGURAR;
            return {
              proveedor,
              contador: new ContadorIntentosRedis(redis, alFallarRedis),
              bitacora: new BitacoraIngresoTypeorm(op.dataSource),
              avisar: (mensaje, datos) => logger.warn({ evento: mensaje, ...datos }),
            };
          },
          inject: [CLIENTE_REDIS],
        },
        {
          provide: RegistrarInicioSesion,
          useFactory: (redis: Redis, dependencias: DependenciasIngreso) =>
            new RegistrarInicioSesion({
              sesiones: new RegistroSesionesRedis(redis, alFallarRedis),
              bitacora: dependencias.bitacora,
              avisar: dependencias.avisar,
            }),
          inject: [CLIENTE_REDIS, DEPENDENCIAS_INGRESO],
        },
        { provide: IngresarConClave, useFactory: (dependencias: DependenciasIngreso) => new IngresarConClave(dependencias), inject: [DEPENDENCIAS_INGRESO] },
        { provide: VerificarMfa, useFactory: (dependencias: DependenciasIngreso) => new VerificarMfa(dependencias), inject: [DEPENDENCIAS_INGRESO] },
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
          provide: ResolverAccesoSoporteVigente,
          useFactory: (unidadDeTrabajo: UnitOfWork, contexto: TenantContext, versiones: PermisosRepositorio, reloj: Clock, repositorios: ReposMembresias) =>
            new ResolverAccesoSoporteVigente({ unidadDeTrabajo, contexto, versiones, reloj, lectura: repositorios.lecturaSoporte }),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, PERMISOS_REPOSITORIO, CLOCK, REPOS_MEMBRESIAS],
        },
        {
          provide: ObtenerMiContexto,
          useFactory: (
            uow: TypeOrmUnitOfWork,
            ctx: TenantContext,
            repo: PermisosRepositorio,
            resolver: ResolverPermisos,
            soporte: ResolverAccesoSoporteVigente,
            repositorios: ReposMembresias,
          ) =>
            new ObtenerMiContexto(
              uow,
              ctx,
              repo,
              new MembresiasLecturaTypeOrm(uow, ctx),
              new PreferenciaSucursalTypeOrm(uow, ctx),
              resolver,
              { resolver: soporte, lectura: repositorios.lecturaSoporte },
              (mensaje, datos) => logger.warn({ mensaje, ...datos }),
            ),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, PERMISOS_REPOSITORIO, ResolverPermisos, ResolverAccesoSoporteVigente, REPOS_MEMBRESIAS],
        },
        {
          provide: DEPENDENCIAS_SESION_SOPORTE,
          useFactory: (unidadDeTrabajo: UnitOfWork, contexto: TenantContext, reloj: Clock, repositorios: ReposMembresias): DependenciasSesionSoporte => ({
            unidadDeTrabajo,
            contexto,
            reloj,
            lectura: repositorios.lecturaSoporte,
            usuarios: repositorios.usuarios,
            tenants: repositorios.tenantsSoporte,
            tenantOperador: op.tenantOperador ?? TENANT_OPERADOR_DEFECTO,
          }),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, CLOCK, REPOS_MEMBRESIAS],
        },
        { provide: EntrarComoSoporte, useFactory: (dependencias: DependenciasSesionSoporte) => new EntrarComoSoporte(dependencias), inject: [DEPENDENCIAS_SESION_SOPORTE] },
        { provide: SalirDeSoporte, useFactory: (dependencias: DependenciasSesionSoporte) => new SalirDeSoporte(dependencias), inject: [DEPENDENCIAS_SESION_SOPORTE] },
        // APP_GUARD se ejecuta en el orden de registro: autenticación, MFA y permiso.
        {
          provide: APP_GUARD,
          useFactory: (r: Reflector, v: VerificadorToken, a: RegistroAcceso, inicioSesion: RegistrarInicioSesion) => new AutenticacionGuard(r, v, a, inicioSesion),
          inject: [Reflector, VERIFICADOR_TOKEN, REGISTRO_ACCESO, RegistrarInicioSesion],
        },
        { provide: APP_GUARD, useFactory: (r: Reflector) => new MfaGuard(r, op.mfaMaxEdadSeg), inject: [Reflector] },
        {
          provide: APP_GUARD,
          useFactory: (r: Reflector, resolver: ResolverPermisos, uow: TypeOrmUnitOfWork, ctx: TenantContext) =>
            new PermisoGuard(r, resolver, new CatalogoPermisosTypeOrm(uow, ctx), new BitacoraSeguridadTypeOrm(uow, ctx), uow, ctx, op.mfaMaxEdadSeg),
          inject: [Reflector, ResolverPermisos, TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
        { provide: APP_INTERCEPTOR, useFactory: (origen: OrigenPeticion) => new OrigenPeticionInterceptor(origen), inject: [ORIGEN_PETICION] },
        { provide: APP_INTERCEPTOR, useFactory: (ctx: TenantContext) => new ContextoTenantInterceptor(ctx), inject: [TENANT_CONTEXT] },
        // Después del de tenant: veta, aplica el modo y audita cada petición de una sesión de soporte (spec 18).
        {
          provide: APP_INTERCEPTOR,
          useFactory: (reflector: Reflector, resolver: ResolverAccesoSoporteVigente, unidadDeTrabajo: UnitOfWork, contexto: TenantContext, repositorios: ReposMembresias) =>
            new SoporteInterceptor(
              reflector,
              resolver,
              new RegistrarPeticionSoporte({ unidadDeTrabajo, contexto, bitacora: repositorios.bitacora }),
              (mensaje, datos) => logger.error({ mensaje, ...datos }),
            ),
          inject: [Reflector, ResolverAccesoSoporteVigente, UNIT_OF_WORK, TENANT_CONTEXT, REPOS_MEMBRESIAS],
        },
      ],
      exports: [VERIFICADOR_TOKEN, ResolverPermisos, ALCANCE_ACTOR, DIRECTORIO_SEG, PRODUCTOS_CONTRATADOS, InvitarPropietario, RevocarAccesosPorTicket, ResolverAccesoSoporteVigente],
    };
  }
}
