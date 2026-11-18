import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { ColaAnalisis, TrabajoAnalisis } from '../../application/ports/cola-analisis.js';

export type { TrabajoAnalisis } from '../../application/ports/cola-analisis.js';

export const NOMBRE_COLA_ANALISIS = 'arc-analisis';
export const EVENTO_ERROR_COLA_ANALISIS = 'arc.analisis.cola_error';
const NOMBRE_TRABAJO_ANALISIS = 'analizar';
/** Un fallo de Storage o del antivirus se reintenta; agotados los intentos el archivo sigue EN_ANALISIS. */
const INTENTOS = 3;
const ESPERA_PRIMER_REINTENTO_MS = 5_000;
const CONEXION_LISTA = 'ready';
/** Lo que se espera una conexión que aún abre o reconecta antes de responder 503. */
const ESPERA_CONEXION_MS = 1_000;

/** Lo único que usa de la cola de BullMQ; las pruebas lo doblan. */
export interface ColaBullmq {
  add(nombre: string, trabajo: TrabajoAnalisis, opciones: object): Promise<unknown>;
}

/** Lo único que usa de la conexión de ioredis. */
export interface ConexionRedis {
  status: string;
  once(evento: string, alOcurrir: () => void): unknown;
  off(evento: string, alOcurrir: () => void): unknown;
}

class ColaNoConectadaError extends Error {
  constructor() {
    super('Redis de la cola de análisis no está conectado');
  }
}

/**
 * `jobId` es el id del archivo: BullMQ no duplica un trabajo que sigue vivo. Los trabajos terminados o
 * fallidos se borran al acabar: un `jobId` retenido impediría reencolar el mismo archivo cuando el cliente
 * confirma otra vez (objeto que aún no estaba, o intentos agotados). Con Redis caído, BullMQ espera la
 * reconexión en vez de fallar: se comprueba antes que la conexión esté lista, para responder 503.
 */
export class ColaAnalisisBullmq implements ColaAnalisis {
  constructor(
    private readonly cola: ColaBullmq,
    private readonly conexion: ConexionRedis,
  ) {}

  async encolar(trabajo: TrabajoAnalisis): Promise<void> {
    await this.esperarConexion();
    await this.cola.add(NOMBRE_TRABAJO_ANALISIS, trabajo, {
      jobId: trabajo.archivoId,
      attempts: INTENTOS,
      backoff: { type: 'exponential', delay: ESPERA_PRIMER_REINTENTO_MS },
      removeOnComplete: true,
      removeOnFail: true,
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

export interface ColaAnalisisAbierta {
  cola: ColaAnalisis;
  cerrar(): Promise<void>;
}

/** Conecta al crearse y reconecta sola; la API arranca aunque Redis no esté. */
export function abrirColaAnalisis(redisUrl: string, alFallar: (error: Error) => void): ColaAnalisisAbierta {
  const conexion = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  // Sin listener, ioredis y BullMQ escriben cada reintento como error no manejado.
  conexion.on('error', alFallar);
  const cola = new Queue<TrabajoAnalisis>(NOMBRE_COLA_ANALISIS, { connection: conexion });
  cola.on('error', alFallar);
  return {
    cola: new ColaAnalisisBullmq(cola, conexion),
    cerrar: async () => {
      await cola.close();
      conexion.disconnect();
    },
  };
}
