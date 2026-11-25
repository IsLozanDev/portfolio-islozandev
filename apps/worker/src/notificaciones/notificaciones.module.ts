import { Logger, Module, type DynamicModule } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { REPORTADOR_ERRORES, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import {
  BarrerProgramacionesAtrasadas,
  EjecutarProgramacion,
  EntregarMensaje,
  NotificacionesModule,
  type EntornoNotificaciones,
} from '@vitrina/plataforma/notificaciones';
import { personasParaWorker } from './personas-worker.module.js';
import { TareaEnviosNotificaciones } from './tarea-envios.js';
import { TareaProgramacionesNotificaciones } from './tarea-programaciones.js';

export interface NotificacionesWorkerAppOpciones {
  redisUrl: string;
  entorno: EntornoNotificaciones;
  /** Barrido de programaciones atrasadas entre tenants (spec 45). Las entidades ENTIDADES_PER también van en él. */
  dataSource: DataSource;
}

/**
 * Spec 42: consumidor de `not.mensaje.solicitado` y cola `not-envios`. Spec 45: consumidor de
 * `not.programacion.registrada` y cola `not-programaciones` con su barrido. Necesita KernelInfraModule con
 * registrarEsquemasNot.
 */
@Module({})
export class NotificacionesWorkerModule {
  static register({ redisUrl, entorno, dataSource }: NotificacionesWorkerAppOpciones): DynamicModule {
    const logger = new Logger('Notificaciones');
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    return {
      module: NotificacionesWorkerModule,
      imports: [NotificacionesModule.registerWorker({ redisUrl, entorno, dataSource, imports: [personasParaWorker()] })],
      providers: [
        {
          provide: TareaEnviosNotificaciones,
          useFactory: (entregar: EntregarMensaje, reportador?: ReportadorErrores) => new TareaEnviosNotificaciones(redisUrl, entregar, informar, avisar, reportador),
          inject: [EntregarMensaje, { token: REPORTADOR_ERRORES, optional: true }],
        },
        {
          provide: TareaProgramacionesNotificaciones,
          useFactory: (ejecutar: EjecutarProgramacion, barrer: BarrerProgramacionesAtrasadas, reportador?: ReportadorErrores) =>
            new TareaProgramacionesNotificaciones(redisUrl, ejecutar, barrer, informar, avisar, reportador),
          inject: [EjecutarProgramacion, BarrerProgramacionesAtrasadas, { token: REPORTADOR_ERRORES, optional: true }],
        },
      ],
    };
  }
}
