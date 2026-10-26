import { Logger, Module, type DynamicModule, type Provider } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { Clock, EventPublisher, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import {
  ProcesarVencimientosTenant,
  RepositorioAvisosTypeOrm,
  RevisarVencimientos,
  SuscripcionesARevisarTypeOrm,
  SuscripcionRepositorioTypeOrm,
  TenantRepositorioTypeOrm,
} from '@vitrina/plataforma/org';
import { PARAMETRO_PORT, ParametrosModule, type ParametroPort } from '@vitrina/plataforma/parametros';
import { DiasGraciaParametros } from './dias-gracia.parametros.js';
import { TareaVencimientos } from './tarea-vencimientos.js';

export interface VencimientosOpciones {
  /** Sin tenant: la lectura entre tenants va fuera de toda transacción. */
  dataSource: DataSource;
  /** Caché de parámetros y, si `programar`, colas de BullMQ. */
  redisUrl: string;
  /** El worker programa la tarea diaria; el CLI solo usa RevisarVencimientos. */
  programar: boolean;
}

/** TR-RF-007. Necesita KernelInfraModule. Las entidades ENTIDADES_ORG y ENTIDADES_CFG van en el DataSource. */
@Module({})
export class VencimientosModule {
  static register({ dataSource, redisUrl, programar }: VencimientosOpciones): DynamicModule {
    const logger = new Logger('Vencimientos');
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    const revisar: Provider = {
      provide: RevisarVencimientos,
      useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, ids: IdGenerator, reloj: Clock, eventos: EventPublisher, parametros: ParametroPort) =>
        new RevisarVencimientos(
          new SuscripcionesARevisarTypeOrm(dataSource),
          new ProcesarVencimientosTenant({
            unidadDeTrabajo,
            contexto,
            ids,
            reloj,
            eventos,
            tenants: new TenantRepositorioTypeOrm(unidadDeTrabajo, contexto),
            suscripciones: new SuscripcionRepositorioTypeOrm(unidadDeTrabajo, contexto),
            avisos: new RepositorioAvisosTypeOrm(unidadDeTrabajo),
            diasGracia: new DiasGraciaParametros(parametros),
          }),
          informar,
          avisar,
        ),
      inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, ID_GENERATOR, CLOCK, EVENT_PUBLISHER, PARAMETRO_PORT],
    };
    const tarea: Provider[] = programar
      ? [
          {
            provide: TareaVencimientos,
            useFactory: (revisarVencimientos: RevisarVencimientos, reloj: Clock) => new TareaVencimientos(redisUrl, revisarVencimientos, reloj, informar, avisar),
            inject: [RevisarVencimientos, CLOCK],
          },
        ]
      : [];
    return {
      module: VencimientosModule,
      imports: [ParametrosModule.registrarLectura({ redisUrl })],
      providers: [revisar, ...tarea],
      exports: [RevisarVencimientos],
    };
  }
}
