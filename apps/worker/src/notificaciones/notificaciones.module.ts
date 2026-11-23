import { Logger, Module, type DynamicModule } from '@nestjs/common';
import { REPORTADOR_ERRORES, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import { EntregarMensaje, NotificacionesModule, type EntornoNotificaciones } from '@vitrina/plataforma/notificaciones';
import { TareaEnviosNotificaciones } from './tarea-envios.js';

export interface NotificacionesWorkerAppOpciones {
  redisUrl: string;
  entorno: EntornoNotificaciones;
}

/** Spec 42: consumidor de `not.mensaje.solicitado` y cola `not-envios`. Necesita KernelInfraModule con registrarEsquemasNot. */
@Module({})
export class NotificacionesWorkerModule {
  static register({ redisUrl, entorno }: NotificacionesWorkerAppOpciones): DynamicModule {
    const logger = new Logger('Notificaciones');
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    return {
      module: NotificacionesWorkerModule,
      imports: [NotificacionesModule.registerWorker({ redisUrl, entorno })],
      providers: [
        {
          provide: TareaEnviosNotificaciones,
          useFactory: (entregar: EntregarMensaje, reportador?: ReportadorErrores) => new TareaEnviosNotificaciones(redisUrl, entregar, informar, avisar, reportador),
          inject: [EntregarMensaje, { token: REPORTADOR_ERRORES, optional: true }],
        },
      ],
    };
  }
}
