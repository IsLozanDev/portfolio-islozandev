import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { NOMBRE_COLA_ANALISIS, type AnalizarArchivo, type TrabajoAnalisis } from '@vitrina/plataforma/archivos';
import { REPORTADOR_SIN_ENVIO, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;
/** Cada análisis carga el archivo entero en memoria: dos a la vez son 50 MB como máximo. */
const CONCURRENCIA = 2;
const INTENTOS_SIN_CONFIGURAR = 1;

/**
 * Procesa la cola de análisis de archivos (spec 33). Los reintentos son de BullMQ (`attempts: 3` con espera
 * exponencial al encolar): AnalizarArchivo relanza un fallo de Storage o del antivirus y es idempotente.
 * Agotados los intentos el archivo sigue EN_ANALISIS y el error llega al reportador.
 */
export class TareaAnalisisArchivos implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private trabajador: Worker<TrabajoAnalisis> | null = null;

  constructor(
    redisUrl: string,
    private readonly analizar: Pick<AnalizarArchivo, 'ejecutar'>,
    private readonly informar: Informar,
    private readonly avisar: Informar,
    private readonly reportador: ReportadorErrores = REPORTADOR_SIN_ENVIO,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis del análisis de archivos no disponible', { error: error.name }));
  }

  async onApplicationBootstrap(): Promise<void> {
    this.trabajador = new Worker<TrabajoAnalisis>(NOMBRE_COLA_ANALISIS, (trabajo) => this.analizar.ejecutar(trabajo.data), {
      connection: this.conexion,
      concurrency: CONCURRENCIA,
    });
    this.trabajador.on('failed', (trabajo, error) => {
      // Solo el id del archivo y el nombre del error: ni el nombre original ni la ruta (RNF-026).
      this.avisar('Análisis de archivo falló', { archivoId: trabajo?.id, error: error.name });
      if (esFalloDefinitivo(trabajo)) this.reportador.reportar(error, { cola: NOMBRE_COLA_ANALISIS });
    });
    this.informar('Cola de análisis de archivos lista', { cola: NOMBRE_COLA_ANALISIS });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    this.conexion.disconnect();
  }
}

/** BullMQ avisa `failed` en cada intento; solo el último es definitivo. Sin trabajo no hay intentos que esperar. */
function esFalloDefinitivo(trabajo: Job<TrabajoAnalisis> | undefined): boolean {
  return trabajo === undefined || trabajo.attemptsMade >= (trabajo.opts.attempts ?? INTENTOS_SIN_CONFIGURAR);
}
