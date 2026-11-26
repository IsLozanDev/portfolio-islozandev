import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { ColaEnviosFe, TrabajoEnvioFe } from '../../application/ports/cola-envios-fe.js';

export const NOMBRE_COLA_ENVIOS_FE = 'fe-envios';
export const EVENTO_ERROR_COLA_ENVIOS_FE = 'fe.envios.cola_error';
const NOMBRE_TRABAJO_ENVIO = 'enviar';
/** Un ERROR_TECNICO se reintenta; agotados, el comprobante queda PENDIENTE_ENVIO para el spec 56. */
export const INTENTOS_ENVIO_FE = 3;
const ESPERA_PRIMER_REINTENTO_MS = 5_000;

/** Lo único que usa de la cola de BullMQ; las pruebas lo doblan. */
export interface ColaBullmqEnvios {
  add(nombre: string, trabajo: TrabajoEnvioFe, opciones: object): Promise<unknown>;
}

/** `jobId = comprobanteId`: BullMQ no duplica un trabajo vivo. Los terminados se borran al acabar. */
export class ColaEnviosFeBullmq implements ColaEnviosFe {
  constructor(private readonly cola: ColaBullmqEnvios) {}

  async encolar(trabajo: TrabajoEnvioFe): Promise<void> {
    await this.cola.add(NOMBRE_TRABAJO_ENVIO, trabajo, {
      jobId: trabajo.comprobanteId,
      attempts: INTENTOS_ENVIO_FE,
      backoff: { type: 'exponential', delay: ESPERA_PRIMER_REINTENTO_MS },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}

export interface ColaEnviosFeAbierta {
  cola: ColaEnviosFe;
  cerrar(): Promise<void>;
}

/** Conecta al crearse y reconecta sola. Un fallo de Redis hace fallar la entrega del evento, que el relay reintenta. */
export function abrirColaEnviosFe(redisUrl: string, alFallar: (error: Error) => void): ColaEnviosFeAbierta {
  const conexion = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  // Sin listener, ioredis y BullMQ escriben cada reintento como error no manejado.
  conexion.on('error', alFallar);
  const cola = new Queue<TrabajoEnvioFe>(NOMBRE_COLA_ENVIOS_FE, { connection: conexion });
  cola.on('error', alFallar);
  return {
    cola: new ColaEnviosFeBullmq(cola),
    cerrar: async () => {
      await cola.close();
      conexion.disconnect();
    },
  };
}
