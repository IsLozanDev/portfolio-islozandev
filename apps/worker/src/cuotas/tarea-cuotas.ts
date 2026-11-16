import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { periodoDe, ZONA_CUOTA, type AbrirPeriodoCuotas, type ResultadoAperturaCuotas } from '@vitrina/plataforma/identidad';
import type { Clock } from '@vitrina/plataforma/kernel';
import { REPORTADOR_SIN_ENVIO, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';

export const COLA_CUOTAS = 'idn-cuotas';
export const PROGRAMADOR_CUOTAS = 'idn-cuotas';
/** El día 1 de cada mes a las 00:05 de Lima (spec 29). */
export const PATRON_CUOTAS = '5 0 1 * *';
const NOMBRE_TRABAJO = 'abrir';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;

/** Lo que hace cada disparo: el periodo es el de Lima en el instante del reloj. */
export function abrirPeriodoActual(abrir: Pick<AbrirPeriodoCuotas, 'ejecutar'>, reloj: Clock): Promise<ResultadoAperturaCuotas> {
  return abrir.ejecutar(periodoDe(reloj.now()));
}

/**
 * Programa la apertura mensual de cuotas en BullMQ y la procesa. Mismo esquema que TareaVencimientos:
 * un solo programador por clave y sin reintentos, porque la apertura es idempotente y `cuotas:abrir` la retoma.
 */
export class TareaCuotas implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private readonly cola: Queue;
  private trabajador: Worker | null = null;

  constructor(
    redisUrl: string,
    private readonly abrir: Pick<AbrirPeriodoCuotas, 'ejecutar'>,
    private readonly reloj: Clock,
    private readonly informar: Informar,
    private readonly avisar: Informar,
    private readonly reportador: ReportadorErrores = REPORTADOR_SIN_ENVIO,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis de cuotas no disponible', { error: error.name }));
    this.cola = new Queue(COLA_CUOTAS, { connection: this.conexion });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.cola.upsertJobScheduler(PROGRAMADOR_CUOTAS, { pattern: PATRON_CUOTAS, tz: ZONA_CUOTA }, { name: NOMBRE_TRABAJO });
    this.trabajador = new Worker(COLA_CUOTAS, () => abrirPeriodoActual(this.abrir, this.reloj), { connection: this.conexion });
    this.trabajador.on('failed', (_trabajo, error) => {
      this.avisar('Tarea de cuotas falló', { error: error.name });
      this.reportador.reportar(error, { cola: COLA_CUOTAS });
    });
    this.informar('Tarea de cuotas programada', { patron: PATRON_CUOTAS, zona: ZONA_CUOTA });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    await this.cola.close();
    this.conexion.disconnect();
  }
}
