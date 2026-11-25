import type { Clock } from '@vitrina/plataforma/kernel';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { ColaProgramaciones, TrabajoProgramacion } from '../../application/ports/cola-programaciones.js';

export const NOMBRE_COLA_PROGRAMACIONES = 'not-programaciones';
export const EVENTO_ERROR_COLA_PROGRAMACIONES = 'not.programaciones.cola_error';
/** Nombre de los trabajos de ejecución; el worker programa en la misma cola los del barrido con otro nombre. */
export const NOMBRE_TRABAJO_EJECUCION = 'ejecutar';
/** Un error temporal (base, conflicto) se reintenta; si se agotan, el barrido la vuelve a encolar. */
export const INTENTOS_PROGRAMACION = 3;
const ESPERA_PRIMER_REINTENTO_MS = 5_000;
const SIN_RETARDO = 0;

/** Lo único que usa de la cola de BullMQ; las pruebas lo doblan. */
export interface ColaBullmqProgramaciones {
  add(nombre: string, trabajo: TrabajoProgramacion, opciones: object): Promise<unknown>;
}

/**
 * `jobId = ${programacionId}-${version}`: BullMQ no duplica un trabajo vivo (evento reentregado o barrido), y una
 * reprogramación encola uno nuevo sin borrar el viejo, que la ejecución descarta por versión. Los terminados y los
 * fallidos se borran: así el barrido puede volver a encolar el mismo id.
 */
export class ColaProgramacionesBullmq implements ColaProgramaciones {
  constructor(
    private readonly cola: ColaBullmqProgramaciones,
    private readonly reloj: Clock,
  ) {}

  async encolar({ enviarEn, ...trabajo }: TrabajoProgramacion & { enviarEn: Date }): Promise<void> {
    await this.cola.add(NOMBRE_TRABAJO_EJECUCION, trabajo, {
      jobId: `${trabajo.programacionId}-${trabajo.version}`,
      delay: Math.max(SIN_RETARDO, enviarEn.getTime() - this.reloj.now().getTime()),
      attempts: INTENTOS_PROGRAMACION,
      backoff: { type: 'exponential', delay: ESPERA_PRIMER_REINTENTO_MS },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}

export interface ColaProgramacionesAbierta {
  cola: ColaProgramaciones;
  cerrar(): Promise<void>;
}

/** Conecta al crearse y reconecta sola. Un fallo de Redis hace fallar la entrega del evento, que el relay reintenta. */
export function abrirColaProgramaciones(redisUrl: string, reloj: Clock, alFallar: (error: Error) => void): ColaProgramacionesAbierta {
  const conexion = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  // Sin listener, ioredis y BullMQ escriben cada reintento como error no manejado.
  conexion.on('error', alFallar);
  const cola = new Queue<TrabajoProgramacion>(NOMBRE_COLA_PROGRAMACIONES, { connection: conexion });
  cola.on('error', alFallar);
  return {
    cola: new ColaProgramacionesBullmq(cola, reloj),
    cerrar: async () => {
      await cola.close();
      conexion.disconnect();
    },
  };
}
