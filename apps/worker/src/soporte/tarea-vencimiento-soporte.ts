import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { REPORTADOR_SIN_ENVIO, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import type { ResultadoVencimientoSoporte, VencerAccesosSoporte } from '@vitrina/plataforma/seguridad';

export const COLA_VENCIMIENTO_SOPORTE = 'seg-soporte-vencimiento';
export const PROGRAMADOR_VENCIMIENTO_SOPORTE = 'seg-soporte-vencimiento';
const NOMBRE_TRABAJO = 'vencer';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;

/**
 * Vence los accesos de soporte cada `cadaMs` (spec 18). Mismo patrón que TareaVencimientos: el
 * programador es idempotente por clave y la tarea también; sin reintentos, la siguiente corrida retoma.
 */
export class TareaVencimientoSoporte implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private readonly cola: Queue;
  private trabajador: Worker | null = null;

  constructor(
    redisUrl: string,
    private readonly cadaMs: number,
    private readonly vencer: Pick<VencerAccesosSoporte, 'ejecutar'>,
    private readonly informar: Informar,
    private readonly avisar: Informar,
    private readonly reportador: ReportadorErrores = REPORTADOR_SIN_ENVIO,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis de vencimiento de soporte no disponible', { error: error.name }));
    this.cola = new Queue(COLA_VENCIMIENTO_SOPORTE, { connection: this.conexion });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.cola.upsertJobScheduler(PROGRAMADOR_VENCIMIENTO_SOPORTE, { every: this.cadaMs }, { name: NOMBRE_TRABAJO });
    this.trabajador = new Worker(COLA_VENCIMIENTO_SOPORTE, () => this.vencer.ejecutar(), { connection: this.conexion });
    this.trabajador.on('completed', (_trabajo, resultado: ResultadoVencimientoSoporte) => {
      if (resultado.vencidos > 0 || resultado.fallidos > 0) this.informar('Accesos de soporte vencidos', { ...resultado });
    });
    this.trabajador.on('failed', (_trabajo, error) => {
      this.avisar('Tarea de vencimiento de soporte falló', { error: error.name });
      this.reportador.reportar(error, { cola: COLA_VENCIMIENTO_SOPORTE });
    });
    this.informar('Tarea de vencimiento de soporte programada', { cada_ms: this.cadaMs });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    await this.cola.close();
    this.conexion.disconnect();
  }
}
