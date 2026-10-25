import { Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { EventosModule } from '@vitrina/plataforma/eventos';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import type { Config } from './config/env.js';

/** Cierra la base al final: después de que EventosModule esperó los trabajos en curso (beforeApplicationShutdown). */
class CierreBaseDeDatos implements OnApplicationShutdown {
  constructor(private readonly dataSource: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }
}

@Module({})
export class WorkerModule {
  /** El DataSource llega ya inicializado desde main.ts. */
  static register(dataSource: DataSource, config: Config): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        // Sin esquemas de eventos todavía: cada consumidor que publique registra los suyos al sumarse aquí.
        KernelInfraModule.register({ dataSource, validator: new InMemoryEventSchemaValidator() }),
        EventosModule.registrarWorker({
          dataSource,
          redisUrl: config.REDIS_URL,
          relay: {
            intervaloMs: config.EVT_INTERVALO_MS,
            margenSeg: config.EVT_MARGEN_SEG,
            lote: config.EVT_LOTE,
            rebarridoSeg: config.EVT_REBARRIDO_SEG,
            ventanaSeg: config.EVT_VENTANA_SEG,
          },
          reintentos: { intentos: config.EVT_INTENTOS, esperaBaseMs: config.EVT_BACKOFF_MS, esperaMaximaMs: config.EVT_BACKOFF_MAX_MS },
          concurrencia: config.EVT_CONCURRENCIA,
        }),
      ],
      providers: [{ provide: CierreBaseDeDatos, useValue: new CierreBaseDeDatos(dataSource) }],
    };
  }
}
