import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import {
  NOMBRE_COLA_PROGRAMACIONES,
  NOMBRE_TRABAJO_EJECUCION,
  type BarrerProgramacionesAtrasadas,
  type EjecutarProgramacion,
  type TrabajoProgramacion,
} from '@vitrina/plataforma/notificaciones';
import { REPORTADOR_SIN_ENVIO, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;

export const PROGRAMADOR_BARRIDO_PROGRAMACIONES = 'not-programaciones-barrido';
export const NOMBRE_TRABAJO_BARRIDO = 'barrer';
/** TR-RNF-005: una programación perdida sale en ≤ 20 min (5 de margen + 15 entre barridos). */
export const BARRIDO_CADA_MS = 15 * 60_000;
/** Cada ejecución abre una transacción y llama a `enviar` (sin red): el envío real lo hace `not-envios`. */
const CONCURRENCIA = 4;
const INTENTOS_SIN_CONFIGURAR = 1;

type TrabajoCola = Job<TrabajoProgramacion | Record<string, never>>;

/**
 * Procesa la cola `not-programaciones` (spec 45): los trabajos diferidos de cada programación y el barrido de las
 * atrasadas cada 15 min, en la misma cola con otro nombre de trabajo. El programador es idempotente por clave; al
 * arrancar se barre una vez, porque un programador existente no dispara de inmediato y el worker pudo estar caído.
 */
export class TareaProgramacionesNotificaciones implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private readonly cola: Queue;
  private trabajador: Worker | null = null;

  constructor(
    redisUrl: string,
    private readonly ejecutar: Pick<EjecutarProgramacion, 'ejecutar'>,
    private readonly barrer: Pick<BarrerProgramacionesAtrasadas, 'ejecutar'>,
    private readonly informar: Informar,
    private readonly avisar: Informar,
    private readonly reportador: ReportadorErrores = REPORTADOR_SIN_ENVIO,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis de las programaciones de notificaciones no disponible', { error: error.name }));
    this.cola = new Queue(NOMBRE_COLA_PROGRAMACIONES, { connection: this.conexion });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.cola.upsertJobScheduler(PROGRAMADOR_BARRIDO_PROGRAMACIONES, { every: BARRIDO_CADA_MS }, { name: NOMBRE_TRABAJO_BARRIDO });
    this.trabajador = new Worker(NOMBRE_COLA_PROGRAMACIONES, (trabajo: TrabajoCola) => this.procesar(trabajo), {
      connection: this.conexion,
      concurrency: CONCURRENCIA,
    });
    this.trabajador.on('failed', (trabajo, error) => {
      // Solo ids y el nombre del error: nunca el destinatario ni las variables (RNF-026).
      this.avisar('Programación de notificación falló', { trabajo: trabajo?.name, programacionId: programacionDe(trabajo), error: error.name });
      if (esFalloDefinitivo(trabajo)) this.reportador.reportar(error, { cola: NOMBRE_COLA_PROGRAMACIONES });
    });
    await this.cola.add(NOMBRE_TRABAJO_BARRIDO, {}, { removeOnComplete: true, removeOnFail: true });
    this.informar('Cola de programaciones de notificaciones lista', { cola: NOMBRE_COLA_PROGRAMACIONES, barrido_cada_ms: BARRIDO_CADA_MS });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    await this.cola.close();
    this.conexion.disconnect();
  }

  private async procesar(trabajo: TrabajoCola): Promise<void> {
    if (trabajo.name === NOMBRE_TRABAJO_EJECUCION) return this.ejecutarProgramacion(trabajo.data as TrabajoProgramacion);
    if (trabajo.name === NOMBRE_TRABAJO_BARRIDO) return this.barrerAtrasadas();
  }

  private async ejecutarProgramacion(datos: TrabajoProgramacion): Promise<void> {
    const resultado = await this.ejecutar.ejecutar(datos);
    this.informar('Programación de notificación ejecutada', { programacionId: datos.programacionId, version: datos.version, resultado });
  }

  private async barrerAtrasadas(): Promise<void> {
    const { encoladas } = await this.barrer.ejecutar();
    if (encoladas > 0) this.informar('Programaciones atrasadas encoladas', { encoladas });
  }
}

/** BullMQ avisa `failed` en cada intento; solo el último es definitivo (después, el barrido la retoma). */
function esFalloDefinitivo(trabajo: TrabajoCola | undefined): boolean {
  return trabajo === undefined || trabajo.attemptsMade >= (trabajo.opts.attempts ?? INTENTOS_SIN_CONFIGURAR);
}

function programacionDe(trabajo: TrabajoCola | undefined): string | undefined {
  return trabajo?.name === NOMBRE_TRABAJO_EJECUCION ? (trabajo.data as TrabajoProgramacion).programacionId : undefined;
}
