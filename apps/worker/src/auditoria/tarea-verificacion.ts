import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { VerificarTodosLosTenants } from '@vitrina/plataforma/auditoria';

export const COLA_VERIFICACION = 'aud-verificacion';
export const PROGRAMADOR_VERIFICACION = 'aud-verificacion';
/** Todos los días a las 03:30 de Lima: hora de poca carga, distinta de las 06:00 de vencimientos (spec 20b). */
export const PATRON_VERIFICACION_DEFECTO = '30 3 * * *';
export const ZONA_VERIFICACION = 'America/Lima';
const NOMBRE_TRABAJO = 'verificar';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;

/**
 * Programa la verificación diaria de integridad en BullMQ y la procesa, como TareaVencimientos.
 * Sin reintentos: es incremental e idempotente, la siguiente corrida retoma (o `auditoria:verificar`).
 */
export class TareaVerificacionIntegridad implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private readonly cola: Queue;
  private trabajador: Worker | null = null;

  constructor(
    redisUrl: string,
    private readonly patron: string,
    private readonly verificar: Pick<VerificarTodosLosTenants, 'ejecutar'>,
    private readonly informar: Informar,
    private readonly avisar: Informar,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis de la verificación de auditoría no disponible', { error: error.name }));
    this.cola = new Queue(COLA_VERIFICACION, { connection: this.conexion });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.cola.upsertJobScheduler(PROGRAMADOR_VERIFICACION, { pattern: this.patron, tz: ZONA_VERIFICACION }, { name: NOMBRE_TRABAJO });
    this.trabajador = new Worker(COLA_VERIFICACION, () => this.verificar.ejecutar(), { connection: this.conexion });
    this.trabajador.on('failed', (_trabajo, error) => this.avisar('Verificación de auditoría falló', { error: error.name }));
    this.informar('Verificación de auditoría programada', { patron: this.patron, zona: ZONA_VERIFICACION });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    await this.cola.close();
    this.conexion.disconnect();
  }
}
