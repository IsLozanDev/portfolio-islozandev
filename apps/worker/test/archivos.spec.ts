import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { abrirColaAnalisis, NOMBRE_COLA_ANALISIS, type ColaAnalisisAbierta, type ResultadoLimpieza, type TrabajoAnalisis } from '@vitrina/plataforma/archivos';
import { TareaAnalisisArchivos } from '../src/archivos/tarea-analisis.js';
import { COLA_LIMPIEZA, PATRON_LIMPIEZA_DEFECTO, PROGRAMADOR_LIMPIEZA, TareaLimpiezaArchivos, ZONA_LIMPIEZA } from '../src/archivos/tarea-limpieza.js';

// Redis 7 de docker-compose (local) o del servicio de CI.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const ESPERA_MAXIMA_MS = 10_000;
const PAUSA_MS = 50;
const sinLog = () => undefined;

const trabajoDe = (): TrabajoAnalisis => ({ tenantId: randomUUID(), archivoId: randomUUID() });
const pausa = (milisegundos: number) => new Promise((resolver) => setTimeout(resolver, milisegundos));

async function esperarHasta(condicion: () => boolean, descripcion: string): Promise<void> {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error(`no ocurrió: ${descripcion}`);
    await pausa(PAUSA_MS);
  }
}

describe('Cola de análisis de archivos (spec 33, Redis 7)', () => {
  let abierta: ColaAnalisisAbierta;
  let tarea: TareaAnalisisArchivos;
  const analizados: TrabajoAnalisis[] = [];
  const avisos: Record<string, unknown>[] = [];
  const vecesDe = (archivoId: string) => analizados.filter((trabajo) => trabajo.archivoId === archivoId).length;

  beforeAll(async () => {
    abierta = abrirColaAnalisis(REDIS_URL, sinLog);
    tarea = new TareaAnalisisArchivos(
      REDIS_URL,
      {
        ejecutar: async (trabajo) => {
          analizados.push(trabajo);
        },
      },
      sinLog,
      (_mensaje, datos) => void avisos.push(datos),
    );
    await tarea.onApplicationBootstrap();
  });

  afterAll(async () => {
    await tarea.beforeApplicationShutdown();
    await abierta.cerrar();
  });

  it('la cola se llama arc-analisis y el worker recibe el trabajo encolado tal cual', async () => {
    const trabajo = trabajoDe();

    await abierta.cola.encolar(trabajo);
    await esperarHasta(() => vecesDe(trabajo.archivoId) === 1, 'el análisis del trabajo');

    expect(NOMBRE_COLA_ANALISIS).toBe('arc-analisis');
    expect(analizados).toContainEqual(trabajo);
  });

  it('un archivo ya analizado se puede volver a encolar: el trabajo terminado no retiene su jobId', async () => {
    const trabajo = trabajoDe();
    await abierta.cola.encolar(trabajo);
    await esperarHasta(() => vecesDe(trabajo.archivoId) === 1, 'el primer análisis');

    await abierta.cola.encolar(trabajo);
    await esperarHasta(() => vecesDe(trabajo.archivoId) === 2, 'el segundo análisis');

    expect(vecesDe(trabajo.archivoId)).toBe(2);
    expect(avisos).toEqual([]);
  });
});

describe('Limpieza diaria de cargas pendientes (spec 33, Redis 7)', () => {
  let cola: Queue;
  let tarea: TareaLimpiezaArchivos;
  let resultado: ResultadoLimpieza | Error;
  let corridas = 0;
  const informes: [mensaje: string, datos: Record<string, unknown>][] = [];
  const avisos: [mensaje: string, datos: Record<string, unknown>][] = [];
  const reportados: { error: unknown; contexto?: Record<string, string> }[] = [];

  beforeAll(async () => {
    cola = new Queue(COLA_LIMPIEZA, { connection: { url: REDIS_URL } });
    tarea = new TareaLimpiezaArchivos(
      REDIS_URL,
      PATRON_LIMPIEZA_DEFECTO,
      {
        ejecutar: async () => {
          corridas += 1;
          if (resultado instanceof Error) throw resultado;
          return resultado;
        },
      },
      (mensaje, datos) => void informes.push([mensaje, datos]),
      (mensaje, datos) => void avisos.push([mensaje, datos]),
      { reportar: (error, contexto) => void reportados.push({ error, contexto }) },
    );
    await tarea.onApplicationBootstrap();
  });

  afterAll(async () => {
    await tarea.beforeApplicationShutdown();
    await cola.close();
  });

  async function correrAhora(): Promise<void> {
    const antes = corridas;
    await cola.add('limpiar', {});
    await esperarHasta(() => corridas > antes, 'la corrida de limpieza');
    // El aviso del resultado o del fallo llega justo después de la corrida.
    await pausa(PAUSA_MS * 4);
  }

  it('queda programada todos los días a las 03:45 de Lima', async () => {
    const programadores = await cola.getJobSchedulers();

    expect([PATRON_LIMPIEZA_DEFECTO, ZONA_LIMPIEZA]).toEqual(['45 3 * * *', 'America/Lima']);
    expect(programadores).toEqual([expect.objectContaining({ key: PROGRAMADOR_LIMPIEZA, pattern: '45 3 * * *', tz: 'America/Lima' })]);
  });

  it('informa cuántas cargas borró', async () => {
    resultado = { borradas: 3, fallidas: 0 };

    await correrAhora();

    expect(informes).toContainEqual(['Limpieza de cargas pendientes terminada', { borradas: 3, fallidas: 0 }]);
  });

  it('si quedaron cargas sin borrar lo avisa, sin reportar error', async () => {
    resultado = { borradas: 1, fallidas: 2 };

    await correrAhora();

    expect(avisos).toContainEqual(['Limpieza de cargas pendientes terminada', { borradas: 1, fallidas: 2 }]);
    expect(reportados).toEqual([]);
  });

  it('si la limpieza falla entera se reporta con el nombre de la cola', async () => {
    resultado = new Error('la base no responde');

    await correrAhora();

    expect(reportados).toEqual([{ error: expect.objectContaining({ message: 'la base no responde' }), contexto: { cola: 'arc-limpieza' } }]);
    expect(avisos).toContainEqual(['Limpieza de cargas pendientes falló', { error: 'Error' }]);
  });
});
