import { Module, type DynamicModule } from '@nestjs/common';
import type { Clock, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CorrelativosModule, SembrarSeriesIniciales } from '@vitrina/plataforma/correlativos';
import { EventosModule, type PoliticaReintentos } from '@vitrina/plataforma/eventos';
import { CLOCK, ID_GENERATOR, KernelInfraModule, TENANT_CONTEXT, TypeOrmUnitOfWork, type KernelInfraOptions } from '@vitrina/plataforma/kernel-infra';
import { CrearTenant, GestionarSuscripcion, OrgModule, RegistrarEmpresa, TenantRepositorioTypeOrm } from '@vitrina/plataforma/org';
import { PARAMETRO_PORT, ParametrosModule, type ParametroPort } from '@vitrina/plataforma/parametros';
import { InvitarPropietario, SeguridadModule, type SeguridadOpciones } from '@vitrina/plataforma/seguridad';
import { FallidosController } from './eventos/fallidos.controller.js';
import { AltaTenant } from './org/alta-tenant.js';
import { AltaTenantController } from './org/alta-tenant.controller.js';
import { CodigosDeTenantTypeOrm } from './org/codigos-de-tenant.typeorm.js';
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
      // Fallidos y alta de tenant viven aquí y no en sus libs: cruzan componentes que PL-10 no deja importar.
      controllers: [SaludController, FallidosController, AltaTenantController],
      providers: [
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
              codigos: new CodigosDeTenantTypeOrm(dataSource),
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
