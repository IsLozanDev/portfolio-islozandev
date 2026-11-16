import { Module, type DynamicModule, type InjectionToken, type ModuleMetadata } from '@nestjs/common';
import type { Clock, EventPublisher, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { ConsultarDocumento } from './application/consultar-documento.js';
import { ControlCuota } from './application/control-cuota.js';
import type { ConfiguracionCuota, PlanDelTenant } from './application/ports/cuotas.js';
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
import type { ProveedorElegido } from './interface/entorno-identidad.js';
import { IdentidadController } from './interface/identidad.controller.js';

const PLAN_DEL_TENANT = Symbol('PlanDelTenant');
const CONFIGURACION_CUOTA = Symbol('ConfiguracionCuota');

/** Fábrica de un proveedor que arma la app con sus propios tokens (mismo patrón que CatalogosModule). */
export interface FabricaDe<T> {
  useFactory: (...dependencias: never[]) => T;
  inject?: InjectionToken[];
}

export interface IdentidadOpciones {
  proveedor: ProveedorElegido;
  /** Obligatorio con `decolecta`; lo exige exigirProveedorReal al validar el entorno. */
  decolectaToken?: string;
  /** TR-RNF-111: lo arma apps/api con hashDocumento y la sal de observabilidad, que idn no importa (PL-10). */
  hasher: HasherDocumento;
  /** Plan más alto vigente del tenant: lo implementa la app con org (PL-10). */
  planDelTenant: FabricaDe<PlanDelTenant>;
  /** Incluidas por plan y umbral de aviso: lo implementa la app con cfg (TR-RNF-119). */
  configuracionCuota: FabricaDe<ConfiguracionCuota>;
  /** Módulos que exportan lo que inyectan las fábricas (ParametrosModule para `configuracionCuota`). */
  imports?: ModuleMetadata['imports'];
}

/** Con `falso`, el adaptador falso responde bajo el código DECOLECTA de idn.proveedor. */
function crearProveedores({ proveedor, decolectaToken }: IdentidadOpciones): ProveedorIdentidad[] {
  if (proveedor === 'falso') return [new ProveedorFalso()];
  if (!decolectaToken) throw new Error('IDN_DECOLECTA_TOKEN es obligatorio con el proveedor decolecta');
  return [new ProveedorDecolecta({ token: decolectaToken })];
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
      controllers: [IdentidadController],
      providers: [
        { provide: PLAN_DEL_TENANT, useFactory: opciones.planDelTenant.useFactory, inject: opciones.planDelTenant.inject ?? [] },
        {
          provide: CONFIGURACION_CUOTA,
          useFactory: opciones.configuracionCuota.useFactory,
          inject: opciones.configuracionCuota.inject ?? [],
        },
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
}
