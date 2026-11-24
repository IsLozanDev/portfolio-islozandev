import { Logger, Module, type DynamicModule } from '@nestjs/common';
import { CatalogosModule } from '@vitrina/plataforma/catalogos';
import { ComprobantesModule, EjecutarPruebaEmisor, type EntornoFe } from '@vitrina/plataforma/comprobantes';
import { REPORTADOR_ERRORES, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import { OrgModule } from '@vitrina/plataforma/org';
import { TareaPruebasFe } from './tarea-pruebas-fe.js';

const CONTEXTO_LOG = 'PruebasFe';

export interface PruebasFeOpciones {
  /** Cola `fe-pruebas` y caché de catálogos. */
  redisUrl: string;
  entorno: EntornoFe;
  /** El SecretosModule (BOVEDA_SECRETOS) que importa WorkerModule: la misma referencia, una sola bóveda. */
  secretos: DynamicModule;
}

/**
 * Spec 50: consumidor de `fe.prueba.solicitada` y cola `fe-pruebas` hacia el PSE. Necesita KernelInfraModule con
 * registrarEsquemasFe y AUDITORIA; ENTIDADES_FE, ENTIDADES_ORG, ENTIDADES_CAT y ENTIDADES_SEC van en el DataSource.
 */
@Module({})
export class PruebasFeModule {
  static register({ redisUrl, entorno, secretos }: PruebasFeOpciones): DynamicModule {
    const logger = new Logger(CONTEXTO_LOG);
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    return {
      module: PruebasFeModule,
      imports: [
        ComprobantesModule.registerPruebas({
          redisUrl,
          entorno,
          imports: [OrgModule.register(), CatalogosModule.registrarLectura({ redisUrl }), secretos],
        }),
      ],
      providers: [
        {
          provide: TareaPruebasFe,
          useFactory: (ejecutar: EjecutarPruebaEmisor, reportador?: ReportadorErrores) => new TareaPruebasFe(redisUrl, ejecutar, informar, avisar, reportador),
          inject: [EjecutarPruebaEmisor, { token: REPORTADOR_ERRORES, optional: true }],
        },
      ],
    };
  }
}
