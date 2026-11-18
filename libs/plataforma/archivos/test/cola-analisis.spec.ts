import { EventEmitter } from 'node:events';
import {
  ColaAnalisisBullmq,
  NOMBRE_COLA_ANALISIS,
  type ColaBullmq,
  type ConexionRedis,
} from '../src/infrastructure/bullmq/cola-analisis.bullmq.js';

const TRABAJO = { tenantId: '33000000-0000-4000-8000-00000000000a', archivoId: '33000000-0000-4000-8000-0000000000a1' };

class ConexionDoble extends EventEmitter implements ConexionRedis {
  constructor(public status: string) {
    super();
  }
}

class ColaDoble implements ColaBullmq {
  readonly agregados: unknown[][] = [];

  add(...argumentos: unknown[]): Promise<unknown> {
    this.agregados.push(argumentos);
    return Promise.resolve();
  }
}

describe('ColaAnalisisBullmq', () => {
  it('la cola se llama arc-analisis', () => {
    expect(NOMBRE_COLA_ANALISIS).toBe('arc-analisis');
  });

  it('encola con el id del archivo como jobId, 3 intentos con espera exponencial y sin retener el trabajo', async () => {
    const cola = new ColaDoble();

    await new ColaAnalisisBullmq(cola, new ConexionDoble('ready')).encolar(TRABAJO);

    expect(cola.agregados).toEqual([
      [
        'analizar',
        TRABAJO,
        {
          jobId: TRABAJO.archivoId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      ],
    ]);
  });

  it('espera a que Redis termine de conectar antes de encolar', async () => {
    const cola = new ColaDoble();
    const conexion = new ConexionDoble('connecting');

    const encolado = new ColaAnalisisBullmq(cola, conexion).encolar(TRABAJO);
    conexion.status = 'ready';
    conexion.emit('ready');
    await encolado;

    expect(cola.agregados).toHaveLength(1);
  });

  it('con Redis caído falla en un segundo y no encola', async () => {
    const cola = new ColaDoble();
    const conexion = new ConexionDoble('reconnecting');

    await expect(new ColaAnalisisBullmq(cola, conexion).encolar(TRABAJO)).rejects.toThrow('no está conectado');

    expect(cola.agregados).toEqual([]);
    expect(conexion.listenerCount('ready')).toBe(0);
  });
});
