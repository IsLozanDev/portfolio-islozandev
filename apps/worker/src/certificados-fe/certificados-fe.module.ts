import { Logger, Module, type DynamicModule, type Provider } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AvisarCertificadosPorVencer, ComprobantesModule } from '@vitrina/plataforma/comprobantes';
import type { Clock } from '@vitrina/plataforma/kernel';
import { CLOCK, REPORTADOR_ERRORES, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import { ParametrosModule } from '@vitrina/plataforma/parametros';
import { TareaCertificadosFe } from './tarea-certificados-fe.js';

const CONTEXTO_LOG = 'CertificadosFe';

export interface CertificadosFeOpciones {
  /** Sin tenant: la lectura entre tenants va fuera de toda transacción. */
  dataSource: DataSource;
  /** Caché de parámetros y, si `programar`, la cola de BullMQ. */
  redisUrl: string;
  /** El worker programa la tarea diaria; el CLI solo usa AvisarCertificadosPorVencer. */
  programar: boolean;
}

/** Spec 49. Necesita KernelInfraModule con registrarEsquemasFe. ENTIDADES_FE y ENTIDADES_CFG van en el DataSource. */
@Module({})
export class CertificadosFeModule {
  static register({ dataSource, redisUrl, programar }: CertificadosFeOpciones): DynamicModule {
    const logger = new Logger(CONTEXTO_LOG);
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const advertir = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    const proveedoresDeTarea: Provider[] = programar
      ? [
          {
            provide: TareaCertificadosFe,
            useFactory: (avisar: AvisarCertificadosPorVencer, reloj: Clock, reportador?: ReportadorErrores) =>
              new TareaCertificadosFe(redisUrl, avisar, reloj, informar, advertir, reportador),
            inject: [AvisarCertificadosPorVencer, CLOCK, { token: REPORTADOR_ERRORES, optional: true }],
          },
        ]
      : [];
    return {
      module: CertificadosFeModule,
      imports: [ComprobantesModule.registerWorker({ dataSource, imports: [ParametrosModule.registrarLectura({ redisUrl })] })],
      providers: proveedoresDeTarea,
    };
  }
}
