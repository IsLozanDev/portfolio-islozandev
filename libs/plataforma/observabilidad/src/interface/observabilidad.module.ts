import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import { TENANT_CONTEXT } from '@vitrina/plataforma/kernel-infra';
import { opcionesLogger } from '../infrastructure/logger.pino.js';

export interface ObservabilidadOpciones {
  readonly servicio: string;
  readonly nivel: string;
  readonly salDocumento: string;
  /** Solo pruebas: otro destino que stdout. */
  readonly destino?: DestinationStream;
}

/** Requiere `KernelInfraModule` (global) por `TENANT_CONTEXT`. La app activa el logger con `app.useLogger(app.get(Logger))`. */
@Module({})
export class ObservabilidadModule {
  static register(opciones: ObservabilidadOpciones): DynamicModule {
    return {
      module: ObservabilidadModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [TENANT_CONTEXT],
          useFactory: (contexto: TenantContext) => {
            const opcionesPino = opcionesLogger({ ...opciones, contexto });
            return { pinoHttp: opciones.destino ? [opcionesPino, opciones.destino] : opcionesPino };
          },
        }),
      ],
      exports: [LoggerModule],
    };
  }
}
