import { Logger, Module, type DynamicModule, type Provider } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { Clock, EventPublisher, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, REPORTADOR_ERRORES, TENANT_CONTEXT, TypeOrmUnitOfWork, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import { crearVencerAccesosSoporte, VencerAccesosSoporte } from '@vitrina/plataforma/seguridad';
import { TareaVencimientoSoporte } from './tarea-vencimiento-soporte.js';

export interface SoporteOpciones {
  /** Para la lectura entre tenants, fuera de toda transacción. */
  dataSource: DataSource;
  redisUrl: string;
  /** Cada cuánto corre la tarea (SOPORTE_VENCIMIENTO_CADA_MS). */
  cadaMs: number;
  /** El worker programa la tarea; el CLI solo usa VencerAccesosSoporte. */
  programar: boolean;
}

/** Spec 18. Necesita KernelInfraModule. ENTIDADES_SEG_LECTURA y ENTIDADES_SEG_SOPORTE van en el DataSource. */
@Module({})
export class SoporteModule {
  static register({ dataSource, redisUrl, cadaMs, programar }: SoporteOpciones): DynamicModule {
    const logger = new Logger('Soporte');
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    const vencer: Provider = {
      provide: VencerAccesosSoporte,
      useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock, eventos: EventPublisher) =>
        crearVencerAccesosSoporte({ unidadDeTrabajo, contexto, reloj, eventos, dataSource, avisar }),
      inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, EVENT_PUBLISHER],
    };
    const tarea: Provider[] = programar
      ? [
          {
            provide: TareaVencimientoSoporte,
            useFactory: (vencerAccesos: VencerAccesosSoporte, reportador?: ReportadorErrores) =>
              new TareaVencimientoSoporte(redisUrl, cadaMs, vencerAccesos, informar, avisar, reportador),
            inject: [VencerAccesosSoporte, { token: REPORTADOR_ERRORES, optional: true }],
          },
        ]
      : [];
    return { module: SoporteModule, providers: [vencer, ...tarea], exports: [VencerAccesosSoporte] };
  }
}
