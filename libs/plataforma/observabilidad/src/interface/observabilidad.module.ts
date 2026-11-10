import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import { REPORTADOR_ERRORES, TENANT_CONTEXT } from '@vitrina/plataforma/kernel-infra';
import { opcionesLogger } from '../infrastructure/logger.pino.js';
import { ReportadorErroresSentry } from '../infrastructure/reportador-errores.sentry.js';

export interface ObservabilidadOpciones {
  readonly servicio: string;
  readonly nivel: string;
  readonly salDocumento: string;
  /** Solo pruebas: otro destino que stdout. */
  readonly destino?: DestinationStream;
}

/**
 * Requiere `KernelInfraModule` (global) por `TENANT_CONTEXT`. La app activa el logger con `usarLoggerDeObservabilidad`.
 * Global para que el filtro de la api y las tareas del worker reciban `REPORTADOR_ERRORES`.
 */
@Module({})
export class ObservabilidadModule {
  static register(opciones: ObservabilidadOpciones): DynamicModule {
    return {
      module: ObservabilidadModule,
      global: true,
      imports: [
        LoggerModule.forRootAsync({
          inject: [TENANT_CONTEXT],
          useFactory: (contexto: TenantContext) => {
            const opcionesPino = opcionesLogger({ ...opciones, contexto });
            return { pinoHttp: opciones.destino ? [opcionesPino, opciones.destino] : opcionesPino };
          },
        }),
      ],
      providers: [{ provide: REPORTADOR_ERRORES, useClass: ReportadorErroresSentry }],
      exports: [LoggerModule, REPORTADOR_ERRORES],
    };
  }
}
