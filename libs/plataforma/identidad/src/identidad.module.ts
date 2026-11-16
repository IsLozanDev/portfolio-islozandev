import { Logger, Module, type DynamicModule, type InjectionToken, type ModuleMetadata, type Provider } from '@nestjs/common';
import type { Clock, EventPublisher, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { AbrirPeriodoCuotas } from './application/abrir-periodo-cuotas.js';
import { ActualizarProveedor } from './application/actualizar-proveedor.js';
import { AjustarCuota } from './application/ajustar-cuota.js';
import { ConsultarCuotaActual } from './application/consultar-cuota-actual.js';
import { ConsultarDocumento } from './application/consultar-documento.js';
import { ControlCuota } from './application/control-cuota.js';
import { DetalleDeCuota } from './application/detalle-cuota.js';
import { ListarCuotas } from './application/listar-cuotas.js';
import { ListarProveedores } from './application/listar-proveedores.js';
import type { ConfiguracionCuota, PlanDelTenant, TenantsActivos, VerificadorOperador } from './application/ports/cuotas.js';
import { IDENTIDAD, type IdentidadPort } from './application/ports/identidad.port.js';
import type { HasherDocumento } from './application/ports/persistencia.js';
import type { ProveedorIdentidad } from './application/ports/proveedores.js';
import { ServicioIdentidad } from './application/servicio-identidad.js';
import { ProveedorDecolecta } from './infrastructure/decolecta/proveedor.decolecta.js';
import { ProveedorFalso } from './infrastructure/falso/proveedor.falso.js';
import { ProveedorConRespaldo } from './infrastructure/respaldo/proveedor-con-respaldo.js';
import { BitacoraConsultasTypeOrm } from './infrastructure/typeorm/bitacora-consultas.repositorio.js';
import { CacheIdentidadRepositorioTypeOrm } from './infrastructure/typeorm/cache-identidad.repositorio.js';
import { ConfiguracionProveedoresTypeOrm } from './infrastructure/typeorm/configuracion-proveedores.repositorio.js';
import { RepositorioCuotasTypeOrm } from './infrastructure/typeorm/cuota.repositorio.js';
import { LecturaCuotasConsolaTypeOrm } from './infrastructure/typeorm/lectura-cuotas-consola.js';
import { RepositorioProveedoresTypeOrm } from './infrastructure/typeorm/proveedores.repositorio.js';
import { CuotasController } from './interface/cuotas.controller.js';
import type { ProveedorElegido } from './interface/entorno-identidad.js';
import { IdentidadController } from './interface/identidad.controller.js';
import { ProveedoresController } from './interface/proveedores.controller.js';

const PLAN_DEL_TENANT = Symbol('PlanDelTenant');
const CONFIGURACION_CUOTA = Symbol('ConfiguracionCuota');
const TENANTS_ACTIVOS = Symbol('TenantsActivos');
const VERIFICADOR_OPERADOR = Symbol('VerificadorOperador');
const CONTEXTO_LOG_CUOTAS = 'CuotasIdentidad';

/** Fábrica de un proveedor que arma la app con sus propios tokens (mismo patrón que CatalogosModule). */
export interface FabricaDe<T> {
  useFactory: (...dependencias: never[]) => T;
  inject?: InjectionToken[];
}

/** Lo que la cuota necesita de otros componentes: lo arman las apps (PL-10, TR-RNF-119). */
export interface CuotaOpciones {
  /** Plan más alto vigente del tenant: lo implementa la app con org. */
  planDelTenant: FabricaDe<PlanDelTenant>;
  /** Incluidas por plan y umbral de aviso: lo implementa la app con cfg. */
  configuracionCuota: FabricaDe<ConfiguracionCuota>;
  /** Módulos que exportan lo que inyectan las fábricas (ParametrosModule para `configuracionCuota`). */
  imports?: ModuleMetadata['imports'];
}

export interface IdentidadOpciones extends CuotaOpciones {
  proveedor: ProveedorElegido;
  /** Obligatorio con `decolecta`; lo exige exigirProveedorReal al validar el entorno. */
  decolectaToken?: string;
  /** TR-RNF-111: lo arma apps/api con hashDocumento y la sal de observabilidad, que idn no importa (PL-10). */
  hasher: HasherDocumento;
  /** Regla del tenant operador para la consola de cuotas y proveedores: la implementa apps/api con org. */
  verificadorOperador: FabricaDe<VerificadorOperador>;
}

export interface CuotasWorkerOpciones extends CuotaOpciones {
  /** Tenants ACTIVO: lo implementa el worker con org. */
  tenantsActivos: FabricaDe<TenantsActivos>;
}

/** Con `falso`, el adaptador falso responde bajo el código DECOLECTA de idn.proveedor. */
function crearProveedores({ proveedor, decolectaToken }: IdentidadOpciones): ProveedorIdentidad[] {
  if (proveedor === 'falso') return [new ProveedorFalso()];
  if (!decolectaToken) throw new Error('IDN_DECOLECTA_TOKEN es obligatorio con el proveedor decolecta');
  return [new ProveedorDecolecta({ token: decolectaToken })];
}

function desdeFabrica<T>(token: InjectionToken, fabrica: FabricaDe<T>): Provider {
  return { provide: token, useFactory: fabrica.useFactory, inject: fabrica.inject ?? [] };
}

/** Cuota propia y consola del operador (spec 29). */
function proveedoresConsolaCuotas(): Provider[] {
  return [
    {
      provide: ConsultarCuotaActual,
      useFactory: (
        unidadDeTrabajo: TypeOrmUnitOfWork,
        contexto: TenantContext,
        reloj: Clock,
        planDelTenant: PlanDelTenant,
        configuracion: ConfiguracionCuota,
      ) =>
        new ConsultarCuotaActual({ unidadDeTrabajo, contexto, reloj, repositorio: new RepositorioCuotasTypeOrm(unidadDeTrabajo), planDelTenant, configuracion }),
      inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, PLAN_DEL_TENANT, CONFIGURACION_CUOTA],
    },
    {
      provide: ListarCuotas,
      useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, reloj: Clock, verificador: VerificadorOperador) =>
        new ListarCuotas({ unidadDeTrabajo, reloj, verificador, lectura: new LecturaCuotasConsolaTypeOrm(unidadDeTrabajo) }),
      inject: [TypeOrmUnitOfWork, CLOCK, VERIFICADOR_OPERADOR],
    },
    {
      provide: DetalleDeCuota,
      useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, verificador: VerificadorOperador) =>
        new DetalleDeCuota({ unidadDeTrabajo, verificador, lectura: new LecturaCuotasConsolaTypeOrm(unidadDeTrabajo) }),
      inject: [TypeOrmUnitOfWork, VERIFICADOR_OPERADOR],
    },
    {
      provide: AjustarCuota,
      useFactory: (
        unidadDeTrabajo: TypeOrmUnitOfWork,
        contexto: TenantContext,
        reloj: Clock,
        verificador: VerificadorOperador,
        control: ControlCuota,
        publicador: EventPublisher,
      ) =>
        new AjustarCuota({
          unidadDeTrabajo,
          contexto,
          reloj,
          verificador,
          repositorio: new RepositorioCuotasTypeOrm(unidadDeTrabajo),
          control,
          publicador,
        }),
      inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, VERIFICADOR_OPERADOR, ControlCuota, EVENT_PUBLISHER],
    },
  ];
}

/** Consola de proveedores del operador (spec 29). */
function proveedoresConsolaProveedores(): Provider[] {
  return [
    {
      provide: ListarProveedores,
      useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, verificador: VerificadorOperador) =>
        new ListarProveedores({ unidadDeTrabajo, verificador, repositorio: new RepositorioProveedoresTypeOrm(unidadDeTrabajo) }),
      inject: [TypeOrmUnitOfWork, VERIFICADOR_OPERADOR],
    },
    {
      provide: ActualizarProveedor,
      useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, reloj: Clock, verificador: VerificadorOperador, publicador: EventPublisher) =>
        new ActualizarProveedor({ unidadDeTrabajo, reloj, verificador, repositorio: new RepositorioProveedoresTypeOrm(unidadDeTrabajo), publicador }),
      inject: [TypeOrmUnitOfWork, CLOCK, VERIFICADOR_OPERADOR, EVENT_PUBLISHER],
    },
  ];
}

function proveedoresCuota(opciones: CuotaOpciones): Provider[] {
  return [
    desdeFabrica(PLAN_DEL_TENANT, opciones.planDelTenant),
    desdeFabrica(CONFIGURACION_CUOTA, opciones.configuracionCuota),
    {
      provide: ControlCuota,
      useFactory: (
        unidadDeTrabajo: TypeOrmUnitOfWork,
        planDelTenant: PlanDelTenant,
        configuracion: ConfiguracionCuota,
        publicador: EventPublisher,
        reloj: Clock,
      ) => new ControlCuota({ repositorio: new RepositorioCuotasTypeOrm(unidadDeTrabajo), planDelTenant, configuracion, publicador, reloj }),
      inject: [TypeOrmUnitOfWork, PLAN_DEL_TENANT, CONFIGURACION_CUOTA, EVENT_PUBLISHER, CLOCK],
    },
  ];
}

// Usa los tokens de KernelInfraModule y SeguridadModule (ambos globales), que la app debe importar.
// Las entidades ENTIDADES_IDN van en el DataSource de la app.
@Module({})
export class IdentidadModule {
  static register(opciones: IdentidadOpciones): DynamicModule {
    const proveedores = crearProveedores(opciones);
    return {
      module: IdentidadModule,
      imports: opciones.imports ?? [],
      controllers: [IdentidadController, CuotasController, ProveedoresController],
      providers: [
        ...proveedoresCuota(opciones),
        desdeFabrica(VERIFICADOR_OPERADOR, opciones.verificadorOperador),
        ...proveedoresConsolaCuotas(),
        ...proveedoresConsolaProveedores(),
        {
          provide: ConsultarDocumento,
          // Un solo ProveedorConRespaldo por instancia: sus circuit breakers viven en memoria.
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock, cuota: ControlCuota) =>
            new ConsultarDocumento({
              unidadDeTrabajo,
              contexto,
              reloj,
              cache: new CacheIdentidadRepositorioTypeOrm(unidadDeTrabajo),
              bitacora: new BitacoraConsultasTypeOrm(unidadDeTrabajo),
              configuracion: new ConfiguracionProveedoresTypeOrm(unidadDeTrabajo),
              consultor: new ProveedorConRespaldo(proveedores, reloj),
              cuota,
              hasher: opciones.hasher,
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ControlCuota],
        },
        {
          provide: IDENTIDAD,
          useFactory: (consultarDocumento: ConsultarDocumento): IdentidadPort => new ServicioIdentidad(consultarDocumento),
          inject: [ConsultarDocumento],
        },
      ],
      exports: [IDENTIDAD],
    };
  }

  /** Solo la apertura mensual de cuotas (spec 29), sin controladores ni proveedores externos. */
  static registrarCuotasWorker(opciones: CuotasWorkerOpciones): DynamicModule {
    const logger = new Logger(CONTEXTO_LOG_CUOTAS);
    return {
      module: IdentidadModule,
      imports: opciones.imports ?? [],
      providers: [
        ...proveedoresCuota(opciones),
        desdeFabrica(TENANTS_ACTIVOS, opciones.tenantsActivos),
        {
          provide: AbrirPeriodoCuotas,
          useFactory: (tenants: TenantsActivos, contexto: TenantContext, unidadDeTrabajo: TypeOrmUnitOfWork, control: ControlCuota) =>
            new AbrirPeriodoCuotas({
              tenants,
              contexto,
              unidadDeTrabajo,
              control,
              informar: (mensaje, datos) => logger.log({ mensaje, ...datos }),
              avisar: (mensaje, datos) => logger.warn({ mensaje, ...datos }),
            }),
          inject: [TENANTS_ACTIVOS, TENANT_CONTEXT, TypeOrmUnitOfWork, ControlCuota],
        },
      ],
      exports: [AbrirPeriodoCuotas],
    };
  }
}
