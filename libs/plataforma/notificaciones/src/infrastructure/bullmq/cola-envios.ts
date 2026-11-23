import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { ColaEnvios, TrabajoEnvio } from '../../application/ports/cola-envios.js';

export const NOMBRE_COLA_ENVIOS = 'not-envios';
export const EVENTO_ERROR_COLA_ENVIOS = 'not.envios.cola_error';
const NOMBRE_TRABAJO_ENVIO = 'entregar';
/** Un error temporal del proveedor se reintenta; en el último intento el mensaje queda FALLIDO. */
export const INTENTOS_ENVIO = 3;
const ESPERA_PRIMER_REINTENTO_MS = 5_000;
/**
 * Límite de tasa de la cuenta de Resend (2 por segundo por defecto). Va en el Worker de BullMQ, que es quien
 * lo aplica; un 429 igual es error temporal y se reintenta.
 */
export const LIMITE_ENVIOS = { max: 2, duration: 1_000 } as const;

/** Lo único que usa de la cola de BullMQ; las pruebas lo doblan. */
export interface ColaBullmq {
  add(nombre: string, trabajo: TrabajoEnvio, opciones: object): Promise<unknown>;
}

/**
 * `jobId = mensajeId`: BullMQ no duplica un trabajo vivo, y un evento reentregado no envía dos veces (el
 * procesador ignora un mensaje que ya no está ENCOLADO). Los trabajos terminados se borran al acabar.
 */
export class ColaEnviosBullmq implements ColaEnvios {
  constructor(private readonly cola: ColaBullmq) {}

  async encolar(trabajo: TrabajoEnvio, retardoMs: number): Promise<void> {
    await this.cola.add(NOMBRE_TRABAJO_ENVIO, trabajo, {
      jobId: trabajo.mensajeId,
      delay: retardoMs,
      attempts: INTENTOS_ENVIO,
      backoff: { type: 'exponential', delay: ESPERA_PRIMER_REINTENTO_MS },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}

export interface ColaEnviosAbierta {
  cola: ColaEnvios;
  cerrar(): Promise<void>;
}

/** Conecta al crearse y reconecta sola. Un fallo de Redis hace fallar la entrega del evento, que el relay reintenta. */
export function abrirColaEnvios(redisUrl: string, alFallar: (error: Error) => void): ColaEnviosAbierta {
  const conexion = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  // Sin listener, ioredis y BullMQ escriben cada reintento como error no manejado.
  conexion.on('error', alFallar);
  const cola = new Queue<TrabajoEnvio>(NOMBRE_COLA_ENVIOS, { connection: conexion });
  cola.on('error', alFallar);
  return {
    cola: new ColaEnviosBullmq(cola),
    cerrar: async () => {
      await cola.close();
      conexion.disconnect();
    },
  };
}
