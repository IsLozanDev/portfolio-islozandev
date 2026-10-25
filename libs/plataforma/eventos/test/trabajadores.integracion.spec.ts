import { randomBytes } from 'node:crypto';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { crearConexionColas } from '../src/infrastructure/bullmq/conexion-redis.js';
import { opcionesDeTrabajo, type PoliticaReintentos } from '../src/infrastructure/bullmq/politica-reintentos.js';
import { TrabajadoresEventos } from '../src/infrastructure/bullmq/trabajadores-eventos.js';
import { NombreConsumidor } from '../src/domain/nombre-consumidor.js';
import { citaCreada, crearEntornoEntrega, esperarHasta, type EntornoEntrega } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

// Redis 7 de docker-compose (local) o del servicio de CI. Necesita además PostgreSQL: corre solo en CI.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
// Backoff de 10 ms: 8 intentos terminan en menos de un segundo.
const POLITICA: PoliticaReintentos = { intentos: 8, esperaBaseMs: 10, esperaMaximaMs: 40 };
const LIMITE_ESPERA_MS = 20_000;

describeConDb('TrabajadoresEventos con BullMQ y Redis 7', () => {
  let entorno: EntornoEntrega;
  let conexion: Redis;
  let trabajadores: TrabajadoresEventos;
  let colas: Queue[];
  // Consumidores únicos por corrida: las colas de una corrida anterior no interfieren.
  const sufijo = randomBytes(3).toString('hex');
  const exitoso = `prueba-ok-${sufijo}`;
  const fallon = `prueba-falla-${sufijo}`;
  const llamadas: string[] = [];

  beforeAll(async () => {
    entorno = await crearEntornoEntrega();
    conexion = crearConexionColas(REDIS_URL, () => undefined);
    entorno.suscripciones.suscribir(exitoso, 'cita.creada', async (evento) => {
      llamadas.push(evento.eventId);
    });
    entorno.suscripciones.suscribir(fallon, 'cita.creada', async () => {
      throw new Error('el consumidor sigue caído');
    });
    trabajadores = new TrabajadoresEventos({ conexion, concurrencia: 2, politica: POLITICA }, entorno.suscripciones, entorno.entregar);
    trabajadores.iniciar();
    colas = [exitoso, fallon].map((consumidor) => new Queue(NombreConsumidor.de(consumidor).cola, { connection: conexion }));
  });

  afterAll(async () => {
    await trabajadores.cerrar();
    await Promise.all(colas.map(async (cola) => {
      await cola.obliterate({ force: true });
      await cola.close();
    }));
    await conexion.quit();
    await entorno.cerrar();
  });

  test('un trabajo encolado se procesa una vez y queda registrado', async () => {
    const evento = citaCreada();

    await colas[0].add(evento.eventType, evento, opcionesDeTrabajo(POLITICA, evento.eventId));

    await esperarHasta(async () => (await entorno.procesados(evento.eventId)).length === 1, LIMITE_ESPERA_MS);
    expect(llamadas.filter((eventId) => eventId === evento.eventId)).toHaveLength(1);
  });

  test('el mismo jobId encolado dos veces se descarta mientras BullMQ lo guarda', async () => {
    const evento = citaCreada();
    const opciones = opcionesDeTrabajo(POLITICA, evento.eventId);

    await colas[0].add(evento.eventType, evento, opciones);
    await esperarHasta(async () => (await entorno.procesados(evento.eventId)).length === 1, LIMITE_ESPERA_MS);
    await colas[0].add(evento.eventType, evento, opciones);

    expect(await colas[0].getJobCountByTypes('waiting', 'delayed', 'active')).toBe(0);
    expect(llamadas.filter((eventId) => eventId === evento.eventId)).toHaveLength(1);
  });

  test('al agotar 8 intentos deja una fila FALLIDO con 8 intentos y el último error', async () => {
    const evento = citaCreada();

    await colas[1].add(evento.eventType, evento, opcionesDeTrabajo(POLITICA, evento.eventId));

    await esperarHasta(async () => (await entorno.fallidos(evento.eventId)).length === 1, LIMITE_ESPERA_MS);
    expect(await entorno.fallidos(evento.eventId)).toEqual([
      expect.objectContaining({ consumidor: fallon, estado: 'FALLIDO', intentos: 8, error: 'el consumidor sigue caído' }),
    ]);
    await esperarHasta(async () => (await colas[1].getJobState(evento.eventId)) === 'failed', LIMITE_ESPERA_MS);
    expect(await entorno.procesados(evento.eventId)).toEqual([]);
  });
});
