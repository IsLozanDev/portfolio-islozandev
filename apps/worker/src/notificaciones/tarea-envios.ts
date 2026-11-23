import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import {
  LIMITE_ENVIOS,
  NOMBRE_COLA_ENVIOS,
  ProveedorNoConfiguradoError,
  type EntregarMensaje,
  type IntentoEnCurso,
  type TrabajoEnvio,
} from '@vitrina/plataforma/notificaciones';
import { REPORTADOR_SIN_ENVIO, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;
/** Cada envío espera a Resend; el límite de tasa real es LIMITE_ENVIOS. */
const CONCURRENCIA = 2;
const INTENTOS_SIN_CONFIGURAR = 1;

/**
 * Procesa la cola `not-envios` (spec 42). Los reintentos son de BullMQ (3 con espera exponencial al encolar):
 * EntregarMensaje relanza un error temporal y en el último intento deja el mensaje FALLIDO. Sin proveedor
 * configurado (dev) el trabajo falla y el mensaje sigue ENCOLADO.
 */
export class TareaEnviosNotificaciones implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private trabajador: Worker<TrabajoEnvio> | null = null;

  constructor(
    redisUrl: string,
    private readonly entregar: Pick<EntregarMensaje, 'ejecutar'>,
    private readonly informar: Informar,
    private readonly avisar: Informar,
    private readonly reportador: ReportadorErrores = REPORTADOR_SIN_ENVIO,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis de los envíos de notificaciones no disponible', { error: error.name }));
  }

  async onApplicationBootstrap(): Promise<void> {
    this.trabajador = new Worker<TrabajoEnvio>(NOMBRE_COLA_ENVIOS, (trabajo) => this.entregar.ejecutar(trabajo.data, intentoDe(trabajo)), {
      connection: this.conexion,
      concurrency: CONCURRENCIA,
      limiter: LIMITE_ENVIOS,
    });
    this.trabajador.on('failed', (trabajo, error) => {
      // Solo el mensaje y el nombre del error: nunca el destino (RNF-026).
      this.avisar('Envío de notificación falló', { mensajeId: trabajo?.data.mensajeId, error: error.name });
      if (esFalloDefinitivo(trabajo) && !(error instanceof ProveedorNoConfiguradoError)) this.reportador.reportar(error, { cola: NOMBRE_COLA_ENVIOS });
    });
    this.informar('Cola de envíos de notificaciones lista', { cola: NOMBRE_COLA_ENVIOS });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    this.conexion.disconnect();
  }
}

/** `attemptsMade` cuenta los intentos ya fallidos: el que corre es el siguiente. */
export function intentoDe(trabajo: Pick<Job<TrabajoEnvio>, 'attemptsMade' | 'opts'>): IntentoEnCurso {
  const numero = trabajo.attemptsMade + 1;
  return { numero, esUltimo: numero >= intentosPermitidos(trabajo) };
}

/** BullMQ avisa `failed` en cada intento; solo el último es definitivo. */
function esFalloDefinitivo(trabajo: Job<TrabajoEnvio> | undefined): boolean {
  return trabajo === undefined || trabajo.attemptsMade >= intentosPermitidos(trabajo);
}

function intentosPermitidos(trabajo: Pick<Job<TrabajoEnvio>, 'opts'>): number {
  return trabajo.opts.attempts ?? INTENTOS_SIN_CONFIGURAR;
}
