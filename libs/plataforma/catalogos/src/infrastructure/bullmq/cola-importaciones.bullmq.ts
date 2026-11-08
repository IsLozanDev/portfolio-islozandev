import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { ColaImportaciones, TrabajoImportacion } from '../../application/ports/importacion.js';

export const NOMBRE_COLA_IMPORTACIONES = 'cat-importaciones';
export const EVENTO_ERROR_COLA = 'cat.importacion.cola_error';
const NOMBRE_TRABAJO_IMPORTACION = 'aplicar';
/** El segundo intento solo cubre un worker que murió a mitad: un fallo de datos queda FALLIDA sin reintentar. */
const INTENTOS = 2;
const TRABAJOS_CONSERVADOS = 100;
const CONEXION_LISTA = 'ready';
/** Lo que se espera una conexión que aún abre o reconecta antes de responder 503. */
const ESPERA_CONEXION_MS = 1_000;

class ColaNoConectadaError extends Error {
  constructor() {
    super('Redis de la cola de importaciones no está conectado');
  }
}

/**
 * `jobId` es el id de la importación: BullMQ no duplica un trabajo que ya tiene. Con Redis caído, BullMQ
 * espera la reconexión en vez de fallar: se comprueba antes que la conexión esté lista, para responder 503.
 */
export class ColaImportacionesBullmq implements ColaImportaciones {
  constructor(
    private readonly cola: Queue,
    private readonly conexion: Redis,
  ) {}

  async encolar(trabajo: TrabajoImportacion): Promise<void> {
    await this.esperarConexion();
    await this.cola.add(NOMBRE_TRABAJO_IMPORTACION, trabajo, {
      jobId: trabajo.importacionId,
      attempts: INTENTOS,
      removeOnComplete: TRABAJOS_CONSERVADOS,
      removeOnFail: TRABAJOS_CONSERVADOS,
    });
  }

  private esperarConexion(): Promise<void> {
    if (this.conexion.status === CONEXION_LISTA) return Promise.resolve();
    return new Promise((resolver, rechazar) => {
      const alEstarLista = () => {
        clearTimeout(limite);
        resolver();
      };
      const limite = setTimeout(() => {
        this.conexion.off(CONEXION_LISTA, alEstarLista);
        rechazar(new ColaNoConectadaError());
      }, ESPERA_CONEXION_MS);
      this.conexion.once(CONEXION_LISTA, alEstarLista);
    });
  }
}

export interface ColaAbierta {
  cola: ColaImportacionesBullmq;
  cerrar(): Promise<void>;
}

/** Conecta al crearse y reconecta sola; la API arranca aunque Redis no esté. */
export function abrirColaImportaciones(redisUrl: string, alFallar: (error: Error) => void): ColaAbierta {
  const conexion = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  // Sin listener, ioredis y BullMQ escriben cada reintento como error no manejado.
  conexion.on('error', alFallar);
  const cola = new Queue(NOMBRE_COLA_IMPORTACIONES, { connection: conexion });
  cola.on('error', alFallar);
  return {
    cola: new ColaImportacionesBullmq(cola, conexion),
    cerrar: async () => {
      await cola.close();
      conexion.disconnect();
    },
  };
}
