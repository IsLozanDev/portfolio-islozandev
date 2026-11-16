import { Logger, Module, type DynamicModule, type Provider } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AbrirPeriodoCuotas, IdentidadModule } from '@vitrina/plataforma/identidad';
import type { Clock, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, REPORTADOR_ERRORES, TENANT_CONTEXT, TypeOrmUnitOfWork, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import { SuscripcionRepositorioTypeOrm } from '@vitrina/plataforma/org';
import { DefinicionesRepositorioTypeOrm, PARAMETRO_PORT, ParametrosModule, type ParametroPort } from '@vitrina/plataforma/parametros';
import { ConfiguracionCuotaParametros } from './configuracion-cuota.parametros.js';
import { PlanDelTenantOrg } from './plan-del-tenant.org.js';
import { TareaCuotas } from './tarea-cuotas.js';
import { TenantsActivosOrg } from './tenants-activos.org.js';

export interface CuotasOpciones {
  /** Sin tenant: la lista de tenants y las definiciones de cfg van fuera de toda transacción. */
  dataSource: DataSource;
  /** Caché de parámetros y, si `programar`, colas de BullMQ. */
  redisUrl: string;
  /** El worker programa la tarea mensual; el CLI solo usa AbrirPeriodoCuotas. */
  programar: boolean;
}

/** Apertura mensual de cuotas de idn (spec 29). Necesita KernelInfraModule; ENTIDADES_IDN, _ORG y _CFG en el DataSource. */
@Module({})
export class CuotasModule {
  static register({ dataSource, redisUrl, programar }: CuotasOpciones): DynamicModule {
    const logger = new Logger('Cuotas');
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    const parametros = ParametrosModule.registrarLectura({ redisUrl });
    const cuotas = IdentidadModule.registrarCuotasWorker({
      imports: [parametros],
      planDelTenant: {
        useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext) =>
          new PlanDelTenantOrg(new SuscripcionRepositorioTypeOrm(unidadDeTrabajo, contexto)),
        inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
      },
      configuracionCuota: {
        useFactory: (parametroPort: ParametroPort) =>
          new ConfiguracionCuotaParametros({ parametros: parametroPort, definiciones: new DefinicionesRepositorioTypeOrm(dataSource), avisar }),
        inject: [PARAMETRO_PORT],
      },
      tenantsActivos: { useFactory: () => new TenantsActivosOrg(dataSource) },
    });
    const tarea: Provider[] = programar
      ? [
          {
            provide: TareaCuotas,
            useFactory: (abrir: AbrirPeriodoCuotas, reloj: Clock, reportador?: ReportadorErrores) =>
              new TareaCuotas(redisUrl, abrir, reloj, informar, avisar, reportador),
            inject: [AbrirPeriodoCuotas, CLOCK, { token: REPORTADOR_ERRORES, optional: true }],
          },
        ]
      : [];
    return {
      module: CuotasModule,
      imports: [cuotas],
      providers: tarea,
      exports: [cuotas],
    };
  }
}
