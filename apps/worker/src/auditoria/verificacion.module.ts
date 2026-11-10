import { Logger, Module, type DynamicModule, type Provider } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AuditoriaModule, VerificarTodosLosTenants } from '@vitrina/plataforma/auditoria';
import { TareaVerificacionIntegridad } from './tarea-verificacion.js';

export interface VerificacionOpciones {
  /** Para la lista de tenants con eventos, fuera de toda transacción. */
  dataSource: DataSource;
  redisUrl: string;
  /** AUD_VERIFICACION_CRON. */
  patron: string;
}

/** Spec 20b. Necesita KernelInfraModule con registrarEsquemasAud. ENTIDADES_AUDITORIA van en el DataSource. */
@Module({})
export class VerificacionModule {
  static register({ dataSource, redisUrl, patron }: VerificacionOpciones): DynamicModule {
    const logger = new Logger('Auditoria');
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    const tarea: Provider = {
      provide: TareaVerificacionIntegridad,
      useFactory: (verificar: VerificarTodosLosTenants) => new TareaVerificacionIntegridad(redisUrl, patron, verificar, informar, avisar),
      inject: [VerificarTodosLosTenants],
    };
    return { module: VerificacionModule, imports: [AuditoriaModule.registrarVerificacion(dataSource)], providers: [tarea] };
  }
}
