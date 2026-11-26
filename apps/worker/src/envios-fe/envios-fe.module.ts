import { Logger, Module, type DynamicModule } from '@nestjs/common';
import { CatalogosModule } from '@vitrina/plataforma/catalogos';
import { ComprobantesModule, EnviarComprobante, type EntornoFe } from '@vitrina/plataforma/comprobantes';
import { REPORTADOR_ERRORES, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import { OrgModule } from '@vitrina/plataforma/org';
import { TareaEnviosFe } from './tarea-envios-fe.js';

const CONTEXTO_LOG = 'EnviosFe';

export interface EnviosFeOpciones {
  /** Cola `fe-envios` y caché de catálogos. */
  redisUrl: string;
  entorno: EntornoFe;
  /** El SecretosModule (BOVEDA_SECRETOS) que importa WorkerModule: la misma referencia, una sola bóveda. */
  secretos: DynamicModule;
  /** El ArchivosWorkerModule que importa WorkerModule (ARCHIVO_SISTEMA_PORT): la misma referencia, un solo Storage. */
  archivos: DynamicModule;
}

/**
 * Spec 52: consumidor de `cpe.emitido` y cola `fe-envios` hacia SUNAT, con el XML y el CDR en TR-ARC. Necesita
 * KernelInfraModule con registrarEsquemasFe; ENTIDADES_FE, ENTIDADES_ORG, ENTIDADES_CAT, ENTIDADES_SEC y ENTIDADES_ARC
 * van en el DataSource.
 */
@Module({})
export class EnviosFeModule {
  static register({ redisUrl, entorno, secretos, archivos }: EnviosFeOpciones): DynamicModule {
    const logger = new Logger(CONTEXTO_LOG);
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    return {
      module: EnviosFeModule,
      imports: [
        ComprobantesModule.registerEnvios({
          redisUrl,
          entorno,
          imports: [OrgModule.register(), CatalogosModule.registrarLectura({ redisUrl }), secretos, archivos],
        }),
      ],
      providers: [
        {
          provide: TareaEnviosFe,
          useFactory: (enviar: EnviarComprobante, reportador?: ReportadorErrores) => new TareaEnviosFe(redisUrl, enviar, informar, avisar, reportador),
          inject: [EnviarComprobante, { token: REPORTADOR_ERRORES, optional: true }],
        },
      ],
    };
  }
}
