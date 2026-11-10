import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { REPORTADOR_SIN_ENVIO, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import { NOMBRE_COLA_IMPORTACIONES, type ProcesarImportacion, type TrabajoImportacion } from '@vitrina/plataforma/catalogos';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;
/** Una a la vez: cada importación bloquea su catálogo y CIE-10 pesa megas. */
const CONCURRENCIA = 1;

/**
 * Procesa la cola de importaciones de catálogos (spec 19b). Los reintentos son de BullMQ (`attempts: 2`
 * al encolar) y solo cubren un worker que murió a mitad: ProcesarImportacion no relanza un fallo de datos.
 */
export class TareaImportaciones implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private trabajador: Worker<TrabajoImportacion> | null = null;

  constructor(
    redisUrl: string,
    private readonly procesar: Pick<ProcesarImportacion, 'ejecutar'>,
    private readonly informar: Informar,
    private readonly avisar: Informar,
    private readonly reportador: ReportadorErrores = REPORTADOR_SIN_ENVIO,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis de importaciones no disponible', { error: error.name }));
  }

  async onApplicationBootstrap(): Promise<void> {
    this.trabajador = new Worker<TrabajoImportacion>(NOMBRE_COLA_IMPORTACIONES, (trabajo) => this.procesar.ejecutar(trabajo.data), {
      connection: this.conexion,
      concurrency: CONCURRENCIA,
    });
    this.trabajador.on('failed', (trabajo, error) => {
      this.avisar('Trabajo de importación falló', { importacionId: trabajo?.id, error: error.name });
      // BullMQ avisa cada intento; solo el último es un fallo definitivo.
      const quedanIntentos = trabajo !== undefined && trabajo.attemptsMade < (trabajo.opts.attempts ?? 1);
      if (!quedanIntentos) this.reportador.reportar(error, { cola: NOMBRE_COLA_IMPORTACIONES });
    });
    this.informar('Cola de importaciones lista', { cola: NOMBRE_COLA_IMPORTACIONES });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    this.conexion.disconnect();
  }
}
