import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { ReencolarAnalisisAtascados } from '@vitrina/plataforma/archivos';
import { REPORTADOR_SIN_ENVIO, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';

export const COLA_REENCOLADO = 'arc-reencolado';
export const PROGRAMADOR_REENCOLADO = 'arc-reencolado';
/** Cada 5 minutos: un archivo atascado (más de 15 minutos EN_ANALISIS) vuelve a la cola a los 20 como mucho. */
export const PATRON_REENCOLADO_DEFECTO = '*/5 * * * *';
export const ZONA_REENCOLADO = 'America/Lima';
const NOMBRE_TRABAJO = 'reencolar';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;

/**
 * Programa en BullMQ el barrido de análisis atascados (spec 34) y lo procesa, como TareaLimpiezaArchivos.
 * Sin reintentos: lo que no se reencoló ahora sale en la corrida siguiente.
 */
export class TareaReencoladoArchivos implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private readonly cola: Queue;
  private trabajador: Worker | null = null;

  constructor(
    redisUrl: string,
    private readonly patron: string,
    private readonly reencolar: Pick<ReencolarAnalisisAtascados, 'ejecutar'>,
    private readonly informar: Informar,
    private readonly avisar: Informar,
    private readonly reportador: ReportadorErrores = REPORTADOR_SIN_ENVIO,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis del reencolado de archivos no disponible', { error: error.name }));
    this.cola = new Queue(COLA_REENCOLADO, { connection: this.conexion });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.cola.upsertJobScheduler(PROGRAMADOR_REENCOLADO, { pattern: this.patron, tz: ZONA_REENCOLADO }, { name: NOMBRE_TRABAJO });
    this.trabajador = new Worker(COLA_REENCOLADO, () => this.reencolarYAvisar(), { connection: this.conexion });
    this.trabajador.on('failed', (_trabajo, error) => {
      this.avisar('Reencolado de análisis atascados falló', { error: error.name });
      this.reportador.reportar(error, { cola: COLA_REENCOLADO });
    });
    this.informar('Reencolado de análisis atascados programado', { patron: this.patron, zona: ZONA_REENCOLADO });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    await this.cola.close();
    this.conexion.disconnect();
  }

  /** Un archivo atascado ya es anormal: con reencolados o fallidos se avisa; sin ninguno, se informa. */
  private async reencolarYAvisar(): Promise<void> {
    const resultado = await this.reencolar.ejecutar();
    const registrar = resultado.reencolados > 0 || resultado.fallidos > 0 ? this.avisar : this.informar;
    registrar('Reencolado de análisis atascados terminado', { ...resultado });
  }
}
