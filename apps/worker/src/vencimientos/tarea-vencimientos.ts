import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { Clock } from '@vitrina/plataforma/kernel';
import { fechaCalendarioDe, ZONA_VENCIMIENTOS, type ResultadoVencimientos, type RevisarVencimientos } from '@vitrina/plataforma/org';

export const COLA_VENCIMIENTOS = 'org-vencimientos';
export const PROGRAMADOR_VENCIMIENTOS = 'org-vencimientos';
/** Todos los días a las 06:00 de Lima (TR-RF-007). */
export const PATRON_VENCIMIENTOS = '0 6 * * *';
const NOMBRE_TRABAJO = 'revisar';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;

/** Lo que hace cada disparo: la fecha es la de Lima en el instante del reloj. */
export function revisarHoy(revisar: Pick<RevisarVencimientos, 'ejecutar'>, reloj: Clock): Promise<ResultadoVencimientos> {
  return revisar.ejecutar(fechaCalendarioDe(reloj.now()));
}

/**
 * Programa la tarea diaria en BullMQ y la procesa. `upsertJobScheduler` es idempotente por clave:
 * con varias instancias del worker queda un solo programador y BullMQ crea un trabajo por disparo.
 * Sin reintentos: la tarea es idempotente y la siguiente corrida (o `vencimientos:ejecutar`) retoma.
 */
export class TareaVencimientos implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private readonly cola: Queue;
  private trabajador: Worker | null = null;

  constructor(
    redisUrl: string,
    private readonly revisar: Pick<RevisarVencimientos, 'ejecutar'>,
    private readonly reloj: Clock,
    private readonly informar: Informar,
    private readonly avisar: Informar,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis de vencimientos no disponible', { error: error.name }));
    this.cola = new Queue(COLA_VENCIMIENTOS, { connection: this.conexion });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.cola.upsertJobScheduler(PROGRAMADOR_VENCIMIENTOS, { pattern: PATRON_VENCIMIENTOS, tz: ZONA_VENCIMIENTOS }, { name: NOMBRE_TRABAJO });
    this.trabajador = new Worker(COLA_VENCIMIENTOS, () => revisarHoy(this.revisar, this.reloj), { connection: this.conexion });
    this.trabajador.on('failed', (_trabajo, error) => this.avisar('Tarea de vencimientos falló', { error: error.name }));
    this.informar('Tarea de vencimientos programada', { patron: PATRON_VENCIMIENTOS, zona: ZONA_VENCIMIENTOS });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    await this.cola.close();
    this.conexion.disconnect();
  }
}
