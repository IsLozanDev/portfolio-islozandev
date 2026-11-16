import { Logger, Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuditoriaModule } from '@vitrina/plataforma/auditoria';
import { CatalogosModule } from '@vitrina/plataforma/catalogos';
import type { Clock, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CorrelativosModule, SembrarSeriesIniciales } from '@vitrina/plataforma/correlativos';
import { EventosModule, type PoliticaReintentos } from '@vitrina/plataforma/eventos';
import {
  CLOCK,
  HttpExceptionFilter,
  ID_GENERATOR,
  KernelInfraModule,
  REPORTADOR_ERRORES,
  REPORTADOR_SIN_ENVIO,
  TENANT_CONTEXT,
  TypeOrmUnitOfWork,
  type KernelInfraOptions,
  type ReportadorErrores,
} from '@vitrina/plataforma/kernel-infra';
import { IDENTIDAD, IdentidadModule, type IdentidadPort, type ProveedorElegido } from '@vitrina/plataforma/identidad';
import { ObservabilidadModule, type ObservabilidadOpciones } from '@vitrina/plataforma/observabilidad';
import {
  CambiarEstadoTenant,
  CrearTenant,
  GestionarSuscripcion,
  OrgModule,
  PADRON_RUC,
  RegistrarEmpresa,
  SuscripcionRepositorioTypeOrm,
  TenantRepositorioTypeOrm,
} from '@vitrina/plataforma/org';
import { DefinicionesRepositorioTypeOrm, PARAMETRO_PORT, ParametrosModule, type ParametroPort } from '@vitrina/plataforma/parametros';
import { InvitarPropietario, SeguridadModule, type SeguridadOpciones } from '@vitrina/plataforma/seguridad';
import { ParametrosCalendarioCfg } from './catalogos/parametros-calendario.js';
import { VerificadorOperadorOrg } from './catalogos/verificador-operador.js';
import { FallidosController } from './eventos/fallidos.controller.js';
import { ConfiguracionCuotaParametros } from './identidad/configuracion-cuota.parametros.js';
import { HasherDocumentoObservabilidad } from './identidad/hasher-documento.js';
import { PadronRucIdentidad } from './identidad/padron-ruc.identidad.js';
import { PlanDelTenantOrg } from './identidad/plan-del-tenant.org.js';
import { VerificadorOperadorIdentidad } from './identidad/verificador-operador.js';
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

const CONTEXTO_LOG_CUOTA = 'CuotaIdentidad';

export type AppOpciones = KernelInfraOptions &
  Omit<SeguridadOpciones, 'dataSource'> & {
    reintentosEventos: PoliticaReintentos;
    /** Código del tenant operador: el único que da de alta tenants (spec 12). */
    tenantOperador: string;
    /** Logs JSON (spec 21). Las pruebas lo omiten y siguen con el logger de Nest. */
    observabilidad?: ObservabilidadOpciones;
    /** Spec 28. `salDocumento` es la misma de los logs (TR-RNF-111). */
    identidad: { proveedor: ProveedorElegido; decolectaToken?: string; salDocumento: string };
  };

@Module({})
export class AppModule {
  /** El DataSource llega ya inicializado desde main.ts; en pruebas puede no estarlo. */
  static register({ dataSource, validator, reintentosEventos, tenantOperador, observabilidad, identidad, ...seguridad }: AppOpciones): DynamicModule {
    // La misma referencia en AppModule y CatalogosModule: Nest crea una sola instancia (un solo Redis de cfg).
    const parametros = ParametrosModule.register({ redisUrl: seguridad.redisUrl });
    const registroCuota = new Logger(CONTEXTO_LOG_CUOTA);
    // La misma referencia en AppModule y OrgModule: una sola instancia de IdentidadModule (sus circuit breakers).
    const identidadModulo = IdentidadModule.register({
      proveedor: identidad.proveedor,
      decolectaToken: identidad.decolectaToken,
      hasher: new HasherDocumentoObservabilidad(identidad.salDocumento),
      imports: [parametros],
      planDelTenant: {
        useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext) =>
          new PlanDelTenantOrg(new SuscripcionRepositorioTypeOrm(unidadDeTrabajo, contexto)),
        inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
      },
      configuracionCuota: {
        useFactory: (parametroPort: ParametroPort) =>
          new ConfiguracionCuotaParametros({
            parametros: parametroPort,
            definiciones: new DefinicionesRepositorioTypeOrm(dataSource),
            avisar: (mensaje, datos) => registroCuota.warn({ mensaje, ...datos }),
          }),
        inject: [PARAMETRO_PORT],
      },
      verificadorOperador: {
        useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext) =>
          new VerificadorOperadorIdentidad(
            new ExigirOperador({ unidadDeTrabajo, contexto, tenants: new TenantRepositorioTypeOrm(unidadDeTrabajo, contexto), tenantOperador }),
            contexto,
          ),
        inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
      },
    });
    return {
      module: AppModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        ...(observabilidad ? [ObservabilidadModule.register(observabilidad)] : []),
        OrgModule.register({
          imports: [identidadModulo],
          padronRuc: {
            provide: PADRON_RUC,
            useFactory: (identidadPort: IdentidadPort) => new PadronRucIdentidad(identidadPort),
            inject: [IDENTIDAD],
          },
        }),
        SeguridadModule.register({ ...seguridad, dataSource, tenantOperador }),
        parametros,
        CorrelativosModule.register(),
        CatalogosModule.register({
          redisUrl: seguridad.redisUrl,
          verificadorOperador: {
            useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext) =>
              new VerificadorOperadorOrg(
                new ExigirOperador({ unidadDeTrabajo, contexto, tenants: new TenantRepositorioTypeOrm(unidadDeTrabajo, contexto), tenantOperador }),
              ),
            inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
          },
          imports: [parametros],
          parametrosCalendario: {
            useFactory: (parametroPort: ParametroPort) => new ParametrosCalendarioCfg(parametroPort),
            inject: [PARAMETRO_PORT],
          },
        }),
        EventosModule.registrarApi({ redisUrl: seguridad.redisUrl, reintentos: reintentosEventos }),
        AuditoriaModule.registrarApi(),
        identidadModulo,
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
        // Spec 21: los errores sin filtro propio de su lib responden sin detalle y los 5xx se reportan (Sentry).
        {
          provide: APP_FILTER,
          useFactory: (reportador?: ReportadorErrores) => new HttpExceptionFilter(reportador ?? REPORTADOR_SIN_ENVIO),
          inject: [{ token: REPORTADOR_ERRORES, optional: true }],
        },
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
