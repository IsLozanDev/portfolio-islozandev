import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import {
  abrirColaAnalisis,
  AntivirusNoDisponibleError,
  NOMBRE_COLA_ANALISIS,
  ReencolarAnalisisAtascados,
  type ColaAnalisisAbierta,
  type ResultadoLimpieza,
  type ResultadoReencolado,
  type TrabajoAnalisis,
} from '@vitrina/plataforma/archivos';
import { TareaAnalisisArchivos, type AntivirusDelWorker } from '../src/archivos/tarea-analisis.js';
import { COLA_LIMPIEZA, PATRON_LIMPIEZA_DEFECTO, PROGRAMADOR_LIMPIEZA, TareaLimpiezaArchivos, ZONA_LIMPIEZA } from '../src/archivos/tarea-limpieza.js';
import {
  COLA_REENCOLADO,
  PATRON_REENCOLADO_DEFECTO,
  PROGRAMADOR_REENCOLADO,
  TareaReencoladoArchivos,
  ZONA_REENCOLADO,
} from '../src/archivos/tarea-reencolado.js';

// Redis 7 de docker-compose (local) o del servicio de CI.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const ESPERA_MAXIMA_MS = 10_000;
const PAUSA_MS = 50;
const sinLog = () => undefined;
const ANTIVIRUS_EICAR: AntivirusDelWorker = { motor: 'eicar', salud: { comprobar: () => Promise.resolve() } };

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
      ANTIVIRUS_EICAR,
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

describe('Comprobación del antivirus al arrancar (spec 34, Redis 7)', () => {
  type Registro = [mensaje: string, datos: Record<string, unknown>];

  /** Arranca la tarea con el antivirus dado y devuelve lo que registró cuando terminó la comprobación. */
  async function arrancarCon(antivirus: AntivirusDelWorker) {
    const informes: Registro[] = [];
    const avisos: Registro[] = [];
    const reportados: { error: unknown; contexto?: Record<string, string> }[] = [];
    const tarea = new TareaAnalisisArchivos(
      REDIS_URL,
      { ejecutar: () => Promise.resolve() },
      antivirus,
      (mensaje, datos) => void informes.push([mensaje, datos]),
      (mensaje, datos) => void avisos.push([mensaje, datos]),
      { reportar: (error, contexto) => void reportados.push({ error, contexto }) },
    );
    await tarea.onApplicationBootstrap();
    await esperarHasta(() => informes.length + avisos.length >= 2, 'la comprobación del antivirus');
    await tarea.beforeApplicationShutdown();
    return { informes, avisos, reportados };
  }

  it('con el antivirus arriba registra «Antivirus listo» con el motor', async () => {
    const { informes, avisos, reportados } = await arrancarCon({ motor: 'clamav', salud: { comprobar: () => Promise.resolve() } });

    expect(informes).toContainEqual(['Antivirus listo', { motor: 'clamav' }]);
    expect([avisos, reportados]).toEqual([[], []]);
  });

  it('con clamd sin responder el worker arranca igual, avisa con el código y lo reporta', async () => {
    const caido = new AntivirusNoDisponibleError('CONEXION');

    const { informes, avisos, reportados } = await arrancarCon({ motor: 'clamav', salud: { comprobar: () => Promise.reject(caido) } });

    expect(informes).toEqual([['Cola de análisis de archivos lista', { cola: 'arc-analisis' }]]);
    expect(avisos).toEqual([['Antivirus no responde', { motor: 'clamav', codigo: 'CONEXION' }]]);
    expect(reportados).toEqual([{ error: caido, contexto: { motor: 'clamav' } }]);
  });
});

describe('Reencolado de análisis atascados (spec 34, Redis 7)', () => {
  let cola: Queue;
  let tarea: TareaReencoladoArchivos;
  let resultado: ResultadoReencolado | Error;
  let corridas = 0;
  const informes: [mensaje: string, datos: Record<string, unknown>][] = [];
  const avisos: [mensaje: string, datos: Record<string, unknown>][] = [];
  const reportados: { error: unknown; contexto?: Record<string, string> }[] = [];

  beforeAll(async () => {
    cola = new Queue(COLA_REENCOLADO, { connection: { url: REDIS_URL } });
    tarea = new TareaReencoladoArchivos(
      REDIS_URL,
      PATRON_REENCOLADO_DEFECTO,
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
    await cola.add('reencolar', {});
    await esperarHasta(() => corridas > antes, 'la corrida del reencolado');
    // El aviso del resultado o del fallo llega justo después de la corrida.
    await pausa(PAUSA_MS * 4);
  }

  it('queda programado cada 5 minutos, en la zona de Lima', async () => {
    const programadores = await cola.getJobSchedulers();

    expect([PATRON_REENCOLADO_DEFECTO, ZONA_REENCOLADO]).toEqual(['*/5 * * * *', 'America/Lima']);
    expect(programadores).toEqual([expect.objectContaining({ key: PROGRAMADOR_REENCOLADO, pattern: '*/5 * * * *', tz: 'America/Lima' })]);
  });

  it('sin archivos atascados lo informa', async () => {
    resultado = { reencolados: 0, fallidos: 0 };

    await correrAhora();

    expect(informes).toContainEqual(['Reencolado de análisis atascados terminado', { reencolados: 0, fallidos: 0 }]);
  });

  it('si reencoló archivos o falló algún encolado lo avisa, sin reportar error', async () => {
    resultado = { reencolados: 2, fallidos: 0 };
    await correrAhora();
    resultado = { reencolados: 0, fallidos: 1 };
    await correrAhora();

    expect(avisos).toEqual([
      ['Reencolado de análisis atascados terminado', { reencolados: 2, fallidos: 0 }],
      ['Reencolado de análisis atascados terminado', { reencolados: 0, fallidos: 1 }],
    ]);
    expect(reportados).toEqual([]);
  });

  it('si el barrido falla entero se reporta con el nombre de la cola', async () => {
    resultado = new Error('la base no responde');

    await correrAhora();

    expect(reportados).toEqual([{ error: expect.objectContaining({ message: 'la base no responde' }), contexto: { cola: 'arc-reencolado' } }]);
    expect(avisos).toContainEqual(['Reencolado de análisis atascados falló', { error: 'Error' }]);
  });
});

describe('Barrido contra la cola real: mismo jobId, un solo trabajo (spec 34, Redis 7)', () => {
  const AHORA = new Date('2026-11-18T15:00:00.000Z');
  let abierta: ColaAnalisisAbierta;
  let colaAnalisis: Queue;

  beforeAll(() => {
    abierta = abrirColaAnalisis(REDIS_URL, sinLog);
    colaAnalisis = new Queue(NOMBRE_COLA_ANALISIS, { connection: { url: REDIS_URL } });
  });

  afterAll(async () => {
    await abierta.cerrar();
    await colaAnalisis.close();
  });

  it('dos corridas seguidas con el trabajo aún vivo dejan un solo trabajo, y al analizarse deja la cola', async () => {
    const atascado = trabajoDe();
    const reencolar = new ReencolarAnalisisAtascados({
      reloj: { now: () => AHORA },
      atascados: { listarEnAnalisisAntesDe: () => Promise.resolve([atascado]) },
      cola: abierta.cola,
    });

    // Sin worker escuchando: el trabajo queda en espera, vivo.
    expect(await reencolar.ejecutar()).toEqual({ reencolados: 1, fallidos: 0 });
    expect(await reencolar.ejecutar()).toEqual({ reencolados: 1, fallidos: 0 });

    const enEspera = (await colaAnalisis.getJobs(['waiting', 'delayed', 'active'])).filter((trabajo) => trabajo.id === `${atascado.archivoId}-1`);
    expect(enEspera.map((trabajo) => trabajo.data)).toEqual([atascado]);

    const analizados: TrabajoAnalisis[] = [];
    const tarea = new TareaAnalisisArchivos(REDIS_URL, { ejecutar: async (trabajo) => void analizados.push(trabajo) }, ANTIVIRUS_EICAR, sinLog, sinLog);
    await tarea.onApplicationBootstrap();
    await esperarHasta(() => analizados.some((trabajo) => trabajo.archivoId === atascado.archivoId), 'el análisis del reencolado');
    await tarea.beforeApplicationShutdown();

    expect(analizados.filter((trabajo) => trabajo.archivoId === atascado.archivoId)).toHaveLength(1);
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
