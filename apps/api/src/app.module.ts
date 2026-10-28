import { Module, type DynamicModule } from '@nestjs/common';
import type { Clock, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CorrelativosModule, SembrarSeriesIniciales } from '@vitrina/plataforma/correlativos';
import { EventosModule, type PoliticaReintentos } from '@vitrina/plataforma/eventos';
import { CLOCK, ID_GENERATOR, KernelInfraModule, TENANT_CONTEXT, TypeOrmUnitOfWork, type KernelInfraOptions } from '@vitrina/plataforma/kernel-infra';
import { CambiarEstadoTenant, CrearTenant, GestionarSuscripcion, OrgModule, RegistrarEmpresa, TenantRepositorioTypeOrm } from '@vitrina/plataforma/org';
import { PARAMETRO_PORT, ParametrosModule, type ParametroPort } from '@vitrina/plataforma/parametros';
import { InvitarPropietario, SeguridadModule, type SeguridadOpciones } from '@vitrina/plataforma/seguridad';
import { FallidosController } from './eventos/fallidos.controller.js';
import { AltaTenant } from './org/alta-tenant.js';
import { AltaTenantController } from './org/alta-tenant.controller.js';
import { ConsolaTenantsController } from './org/consola-tenants.controller.js';
import { ConsolaTenants } from './org/consulta-tenants.js';
import { ConsultaTenantsTypeOrm } from './org/consulta-tenants.typeorm.js';
import { EmpresasController } from './org/empresas.controller.js';
import { ExigirOperador } from './org/operador.js';
import { SucursalesController } from './org/sucursales.controller.js';
import { TenantsPorCodigoTypeOrm } from './org/tenants-por-codigo.typeorm.js';
import { UnidadesController } from './org/unidades.controller.js';
import { SaludController } from './salud/salud.controller.js';

export type AppOpciones = KernelInfraOptions &
  Omit<SeguridadOpciones, 'dataSource'> & {
    reintentosEventos: PoliticaReintentos;
    /** Código del tenant operador: el único que da de alta tenants (spec 12). */
    tenantOperador: string;
  };

@Module({})
export class AppModule {
  /** El DataSource llega ya inicializado desde main.ts; en pruebas puede no estarlo. */
  static register({ dataSource, validator, reintentosEventos, tenantOperador, ...seguridad }: AppOpciones): DynamicModule {
    return {
      module: AppModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        OrgModule,
        SeguridadModule.register({ ...seguridad, dataSource }),
        ParametrosModule.register({ redisUrl: seguridad.redisUrl }),
        CorrelativosModule.register(),
        EventosModule.registrarApi({ redisUrl: seguridad.redisUrl, reintentos: reintentosEventos }),
      ],
      // Fallidos y org viven aquí y no en sus libs: cruzan componentes que PL-10 no deja importar
      // (org no puede usar @Permiso de seguridad).
      controllers: [
        SaludController,
        FallidosController,
        AltaTenantController,
        ConsolaTenantsController,
        EmpresasController,
        SucursalesController,
        UnidadesController,
      ],
      providers: [
        {
          provide: ConsolaTenants,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, cambiarEstadoTenant: CambiarEstadoTenant) =>
            new ConsolaTenants({
              exigirOperador: new ExigirOperador({ unidadDeTrabajo, contexto, tenants: new TenantRepositorioTypeOrm(unidadDeTrabajo, contexto), tenantOperador }),
              consulta: new ConsultaTenantsTypeOrm(dataSource),
              cambiarEstadoTenant,
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CambiarEstadoTenant],
        },
        {
          provide: AltaTenant,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            ids: IdGenerator,
            reloj: Clock,
            parametros: ParametroPort,
            crearTenant: CrearTenant,
            gestionarSuscripcion: GestionarSuscripcion,
            registrarEmpresa: RegistrarEmpresa,
            sembrarSeries: SembrarSeriesIniciales,
            invitarPropietario: InvitarPropietario,
          ) =>
            new AltaTenant({
              unidadDeTrabajo,
              contexto,
              ids,
              reloj,
              tenants: new TenantRepositorioTypeOrm(unidadDeTrabajo, contexto),
              tenantsPorCodigo: new TenantsPorCodigoTypeOrm(dataSource),
              parametros,
              crearTenant,
              gestionarSuscripcion,
              registrarEmpresa,
              sembrarSeries,
              invitarPropietario,
              tenantOperador,
            }),
          inject: [
            TypeOrmUnitOfWork,
            TENANT_CONTEXT,
            ID_GENERATOR,
            CLOCK,
            PARAMETRO_PORT,
            CrearTenant,
            GestionarSuscripcion,
            RegistrarEmpresa,
            SembrarSeriesIniciales,
            InvitarPropietario,
          ],
        },
      ],
    };
  }
}
