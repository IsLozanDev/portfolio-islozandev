import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { ColaPruebasFe, TrabajoPruebaFe } from '../../application/ports/cola-pruebas-fe.js';

export const NOMBRE_COLA_PRUEBAS_FE = 'fe-pruebas';
export const EVENTO_ERROR_COLA_PRUEBAS_FE = 'fe.pruebas.cola_error';
const NOMBRE_TRABAJO_PRUEBA = 'probar';
/** BullMQ rechaza `:` en un jobId propio («Custom Id cannot contain :»). */
const SEPARADOR_ID_TRABAJO = '-';
/** Un ERROR_TECNICO se reintenta; en el último intento la prueba queda ERROR. */
export const INTENTOS_PRUEBA_FE = 3;
const ESPERA_PRIMER_REINTENTO_MS = 5_000;

/** Lo único que usa de la cola de BullMQ; las pruebas lo doblan. */
export interface ColaBullmqPruebas {
  add(nombre: string, trabajo: TrabajoPruebaFe, opciones: object): Promise<unknown>;
}

export function idTrabajoPrueba(trabajo: Pick<TrabajoPruebaFe, 'emisorId' | 'numeroPrueba'>): string {
  return `${trabajo.emisorId}${SEPARADOR_ID_TRABAJO}${trabajo.numeroPrueba}`;
}

/**
 * `jobId = emisorId-numeroPrueba`: BullMQ no duplica un trabajo vivo, y un evento reentregado no envía dos veces (el
 * procesador ignora una prueba que ya no espera resultado). Los trabajos terminados se borran al acabar.
 */
export class ColaPruebasFeBullmq implements ColaPruebasFe {
  constructor(private readonly cola: ColaBullmqPruebas) {}

  async encolar(trabajo: TrabajoPruebaFe): Promise<void> {
    await this.cola.add(NOMBRE_TRABAJO_PRUEBA, trabajo, {
      jobId: idTrabajoPrueba(trabajo),
      attempts: INTENTOS_PRUEBA_FE,
      backoff: { type: 'exponential', delay: ESPERA_PRIMER_REINTENTO_MS },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}

export interface ColaPruebasFeAbierta {
  cola: ColaPruebasFe;
  cerrar(): Promise<void>;
}

/** Conecta al crearse y reconecta sola. Un fallo de Redis hace fallar la entrega del evento, que el relay reintenta. */
export function abrirColaPruebasFe(redisUrl: string, alFallar: (error: Error) => void): ColaPruebasFeAbierta {
  const conexion = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  // Sin listener, ioredis y BullMQ escriben cada reintento como error no manejado.
  conexion.on('error', alFallar);
  const cola = new Queue<TrabajoPruebaFe>(NOMBRE_COLA_PRUEBAS_FE, { connection: conexion });
  cola.on('error', alFallar);
  return {
    cola: new ColaPruebasFeBullmq(cola),
    cerrar: async () => {
      await cola.close();
      conexion.disconnect();
    },
  };
}
