import { Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { EventosModule } from '@vitrina/plataforma/eventos';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { registrarEsquemasOrg } from '@vitrina/plataforma/org';
import { registrarEsquemasSeg } from '@vitrina/plataforma/seguridad';
import type { Config } from './config/env.js';
import { SoporteModule } from './soporte/soporte.module.js';
import { VencimientosModule } from './vencimientos/vencimientos.module.js';

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
    // La tarea de vencimientos publica eventos de org; cada componente que publique registra los suyos aquí.
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasOrg(validator);
    registrarEsquemasSeg(validator);
    return {
      module: WorkerModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
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
        VencimientosModule.register({ dataSource, redisUrl: config.REDIS_URL, programar: true }),
        SoporteModule.register({ dataSource, redisUrl: config.REDIS_URL, cadaMs: config.SOPORTE_VENCIMIENTO_CADA_MS, programar: true }),
      ],
      providers: [{ provide: CierreBaseDeDatos, useValue: new CierreBaseDeDatos(dataSource) }],
    };
  }
}
