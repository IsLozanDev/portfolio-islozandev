import { randomBytes } from 'node:crypto';
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { InMemoryEventSchemaValidator, OutboxPublisher, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { LoteDespachado } from '../src/application/despachar-lote.js';
import { ColaEventosBullMQ, RedisSinRespuestaError } from '../src/infrastructure/bullmq/cola-eventos.bullmq.js';
import { crearConexionColas, crearConexionProductor } from '../src/infrastructure/bullmq/conexion-redis.js';
import type { PoliticaReintentos } from '../src/infrastructure/bullmq/politica-reintentos.js';
import { TrabajadoresEventos } from '../src/infrastructure/bullmq/trabajadores-eventos.js';
import { NombreConsumidor } from '../src/domain/nombre-consumidor.js';
import { crearEntornoEntrega, esperarHasta, SuscripcionesEnMemoria, type EntornoEntrega } from './support/entorno.js';
import { ColaEnMemoria, crearRelay, cursorActual, insertarEnOutbox, pausa, seqDe } from './support/relay.js';
import { describeConDb } from './support/temp-db.js';

// Redis 7 de docker-compose (local) o del servicio de CI. Necesita además PostgreSQL: corre solo con TEST_DATABASE_URL.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const REDIS_INACCESIBLE = 'redis://127.0.0.1:1';
const POLITICA: PoliticaReintentos = { intentos: 8, esperaBaseMs: 10, esperaMaximaMs: 40 };
const LIMITE_ESPERA_MS = 20_000;
const sinEfecto = async () => undefined;

describeConDb('Relay del outbox con PostgreSQL 16 (TR-RF-093, TR-RN-035, TR-RNF-106)', () => {
  let entorno: EntornoEntrega;
  let conexionTrabajadores: Redis;
  let conexionProductor: Redis;
  // Consumidores únicos por corrida: las colas de una corrida anterior en el mismo Redis no interfieren.
  const sufijo = randomBytes(3).toString('hex');

  beforeAll(async () => {
    entorno = await crearEntornoEntrega();
    conexionTrabajadores = crearConexionColas(REDIS_URL, () => undefined);
    conexionProductor = crearConexionProductor(REDIS_URL, () => undefined);
  });

  afterAll(async () => {
    await conexionTrabajadores.quit();
    await conexionProductor.quit();
    await entorno.cerrar();
  });

  /** Cola y trabajadores BullMQ reales sobre las suscripciones dadas. */
  function pilaBullMQ(suscripciones: SuscripcionesEnMemoria) {
    const entregar = entorno.entregarCon(suscripciones);
    const cola = new ColaEventosBullMQ(conexionProductor, POLITICA, () => undefined);
    const nuevosTrabajadores = (conexion: Redis) => new TrabajadoresEventos({ conexion, concurrencia: 4, politica: POLITICA }, suscripciones, entregar);
    return { cola, nuevosTrabajadores };
  }

  async function vaciarColas(consumidores: string[]): Promise<void> {
    for (const consumidor of consumidores) {
      const cola = new Queue(NombreConsumidor.de(consumidor).cola, { connection: conexionTrabajadores });
      await cola.obliterate({ force: true });
      await cola.close();
    }
  }

  test('TR-CA-228: un cita.creada publicado lo procesan prueba-a y prueba-b una vez cada uno', async () => {
    const [consumidorA, consumidorB] = [`prueba-a-${sufijo}`, `prueba-b-${sufijo}`];
    const llamadas = new Map<string, number>();
    const suscripciones = new SuscripcionesEnMemoria();
    for (const consumidor of [consumidorA, consumidorB]) {
      suscripciones.suscribir(consumidor, 'cita.creada', async () => {
        llamadas.set(consumidor, (llamadas.get(consumidor) ?? 0) + 1);
      });
    }
    const { cola, nuevosTrabajadores } = pilaBullMQ(suscripciones);
    const trabajadores = nuevosTrabajadores(conexionTrabajadores);
    trabajadores.iniciar();

    const validador = new InMemoryEventSchemaValidator();
    validador.register('cita.creada', 1, { type: 'object', required: ['cita_id'] });
    let eventId = '';
    const ids = { next: () => (eventId = uuidV7()) };
    const publicador = new OutboxPublisher(entorno.unidadDeTrabajo, entorno.dependencias.contexto, validador, ids);
    await entorno.dependencias.contexto.run({ tenantId: uuidV7() }, () =>
      entorno.unidadDeTrabajo.run(() =>
        publicador.publish({
          eventType: 'cita.creada',
          aggregateType: 'cita',
          aggregateId: uuidV7(),
          aggregateVersion: 1,
          schemaVersion: 1,
          payload: { cita_id: 'c-228' },
          occurredAt: new Date(),
        }),
      ),
    );

    await crearRelay(entorno.dataSource, cola, suscripciones).ejecutar();

    await esperarHasta(async () => (await entorno.procesados(eventId)).length === 2, LIMITE_ESPERA_MS);
    expect(Object.fromEntries(llamadas)).toEqual({ [consumidorA]: 1, [consumidorB]: 1 });
    await trabajadores.cerrar();
    await cola.cerrar();
    await vaciarColas([consumidorA, consumidorB]);
  });

  test('TR-CA-230: con margen de 5 s, el 1001 confirmado 2 s después del 1002 se entrega y no se salta', async () => {
    const tipo = 'prueba.margen';
    const suscripciones = new SuscripcionesEnMemoria();
    suscripciones.suscribir('prueba-a', tipo, sinEfecto);
    const cola = new ColaEnMemoria();
    const relay = crearRelay(entorno.dataSource, cola, suscripciones, { margenSeg: 5 });

    const { primero, segundo } = await confirmarFueraDeOrden(tipo, async (entregados) => {
      await esperarHasta(async () => {
        await relay.ejecutar();
        return entregados().every((eventId) => cola.vecesEncolado('prueba-a', eventId) === 1);
      }, LIMITE_ESPERA_MS);
    });

    expect(await seqDe(entorno.dataSource, primero)).toBeLessThan(await seqDe(entorno.dataSource, segundo));
    expect(cola.vecesEncolado('prueba-a', primero)).toBe(1);
    expect(cola.vecesEncolado('prueba-a', segundo)).toBe(1);
  }, 30_000);

  test('sin margen ni re-barrido el confirmado fuera de orden se salta (control de TR-CA-230)', async () => {
    const tipo = 'prueba.sin-margen';
    const suscripciones = new SuscripcionesEnMemoria();
    suscripciones.suscribir('prueba-a', tipo, sinEfecto);
    const cola = new ColaEnMemoria();
    const relay = crearRelay(entorno.dataSource, cola, suscripciones, { margenSeg: 0 });

    const { primero, segundo } = await confirmarFueraDeOrden(tipo, async () => {
      await esperarHasta(async () => {
        await relay.ejecutar();
        return cola.entregas.length > 0;
      }, LIMITE_ESPERA_MS);
    });
    await relay.ejecutar();

    expect(cola.vecesEncolado('prueba-a', segundo)).toBe(1);
    expect(cola.vecesEncolado('prueba-a', primero)).toBe(0);
  }, 30_000);

  test('el re-barrido entrega una transacción que confirmó con un seq que el cursor ya pasó', async () => {
    const tipo = 'prueba.rebarrido';
    const suscripciones = new SuscripcionesEnMemoria();
    suscripciones.suscribir('prueba-a', tipo, sinEfecto);
    const cola = new ColaEnMemoria();
    const relay = crearRelay(entorno.dataSource, cola, suscripciones, { margenSeg: 1, rebarridoCadaMs: 0 });
    const larga = entorno.dataSource.createQueryRunner();
    await larga.connect();
    await larga.startTransaction();
    const tardio = await insertarEnOutbox(larga.manager, tipo);
    const temprano = await insertarEnOutbox(entorno.dataSource, tipo);

    await esperarHasta(async () => {
      await relay.ejecutar();
      return cola.vecesEncolado('prueba-a', temprano) > 0;
    }, LIMITE_ESPERA_MS);
    expect(await cursorActual(entorno.dataSource)).toBeGreaterThan(await seqDe(larga.manager, tardio));
    await pausa(3000);
    await larga.commitTransaction();
    await larga.release();

    await esperarHasta(async () => {
      await relay.ejecutar();
      return cola.vecesEncolado('prueba-a', tardio) > 0;
    }, LIMITE_ESPERA_MS);
  }, 30_000);

  test('un evento cuyo tipo no tiene suscriptores no se encola y el cursor avanza', async () => {
    const cola = new ColaEnMemoria();
    const eventId = await insertarEnOutbox(entorno.dataSource, 'prueba.sin-suscriptores');

    await crearRelay(entorno.dataSource, cola, new SuscripcionesEnMemoria()).ejecutar();

    expect(cola.entregas).toEqual([]);
    expect(await cursorActual(entorno.dataSource)).toBeGreaterThanOrEqual(await seqDe(entorno.dataSource, eventId));
  });

  test('con Redis caído el cursor no avanza y al volver se entregan los pendientes', async () => {
    const tipo = 'prueba.redis-caido';
    const suscripciones = new SuscripcionesEnMemoria();
    suscripciones.suscribir('prueba-a', tipo, sinEfecto);
    const cola = new ColaEnMemoria();
    const relay = crearRelay(entorno.dataSource, cola, suscripciones);
    const eventId = await insertarEnOutbox(entorno.dataSource, tipo);
    const cursorAntes = await cursorActual(entorno.dataSource);

    cola.caida = true;
    await expect(relay.ejecutar()).rejects.toThrow('Redis no responde');
    expect(await cursorActual(entorno.dataSource)).toBe(cursorAntes);

    cola.caida = false;
    await relay.ejecutar();
    expect(cola.vecesEncolado('prueba-a', eventId)).toBe(1);
    expect(await cursorActual(entorno.dataSource)).toBeGreaterThanOrEqual(await seqDe(entorno.dataSource, eventId));
  });

  // Sin conexión previa falla de inmediato («Connection is closed»); RedisSinRespuestaError cubre un Redis que deja de responder.
  test('con un Redis inaccesible de verdad, ColaEventosBullMQ falla y el cursor no avanza', async () => {
    const tipo = 'prueba.redis-inaccesible';
    const suscripciones = new SuscripcionesEnMemoria();
    suscripciones.suscribir(`prueba-a-${sufijo}`, tipo, sinEfecto);
    const conexion = crearConexionProductor(REDIS_INACCESIBLE, () => undefined);
    const cola = new ColaEventosBullMQ(conexion, POLITICA, () => undefined);
    await insertarEnOutbox(entorno.dataSource, tipo);
    const cursorAntes = await cursorActual(entorno.dataSource);

    try {
      await expect(crearRelay(entorno.dataSource, cola, suscripciones).ejecutar()).rejects.toThrow();
      expect(await cursorActual(entorno.dataSource)).toBe(cursorAntes);
    } finally {
      conexion.disconnect();
    }
  }, 30_000);

  test('con un Redis que acepta la conexión y no responde, encolar vence en 5 s con RedisSinRespuestaError', async () => {
    const conexionesAlMudo: Socket[] = [];
    const mudo: Server = createServer((socket) => conexionesAlMudo.push(socket));
    await new Promise<void>((resolver) => mudo.listen(0, '127.0.0.1', resolver));
    const { port } = mudo.address() as AddressInfo;
    const tipo = 'prueba.redis-mudo';
    const suscripciones = new SuscripcionesEnMemoria();
    suscripciones.suscribir(`prueba-a-${sufijo}`, tipo, sinEfecto);
    const conexion = crearConexionProductor(`redis://127.0.0.1:${port}`, () => undefined);
    const cola = new ColaEventosBullMQ(conexion, POLITICA, () => undefined);
    await insertarEnOutbox(entorno.dataSource, tipo);
    const cursorAntes = await cursorActual(entorno.dataSource);

    try {
      await expect(crearRelay(entorno.dataSource, cola, suscripciones).ejecutar()).rejects.toThrow(RedisSinRespuestaError);
      expect(await cursorActual(entorno.dataSource)).toBe(cursorAntes);
    } finally {
      conexion.disconnect();
      for (const socket of conexionesAlMudo) socket.destroy();
      await new Promise((resolver) => mudo.close(resolver));
    }
  }, 30_000);

  test('dos relays a la vez encolan cada evento una vez por consumidor y el cursor nunca retrocede (TR-RNF-028)', async () => {
    const tipo = 'prueba.dos-relays';
    const suscripciones = new SuscripcionesEnMemoria();
    suscripciones.suscribir('prueba-a', tipo, sinEfecto);
    suscripciones.suscribir('prueba-b', tipo, sinEfecto);
    const cola = new ColaEnMemoria();
    const eventos: string[] = [];
    for (let indice = 0; indice < 100; indice += 1) eventos.push(await insertarEnOutbox(entorno.dataSource, tipo));
    const relays = [0, 1].map(() => crearRelay(entorno.dataSource, cola, suscripciones, { lote: 7 }));
    const cursoresVistos: bigint[][] = [[], []];
    const saltados = [0, 0];

    const girar = async (indice: number) => {
      while (cola.entregas.length < eventos.length * 2) {
        const lote: LoteDespachado | null = await relays[indice].ejecutar();
        if (lote === null) saltados[indice] += 1;
        else cursoresVistos[indice].push(BigInt(lote.cursor));
      }
    };
    await Promise.all([girar(0), girar(1)]);

    for (const eventId of eventos) {
      expect(cola.vecesEncolado('prueba-a', eventId)).toBe(1);
      expect(cola.vecesEncolado('prueba-b', eventId)).toBe(1);
    }
    for (const cursores of cursoresVistos) expect(cursores).toEqual([...cursores].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(await cursorActual(entorno.dataSource)).toBe(await seqDe(entorno.dataSource, eventos.at(-1) ?? ''));
  }, 60_000);

  test('reinicio: con el worker cerrado a mitad de 200 eventos, otro termina y no se pierde ni duplica nada (TR-RNF-106)', async () => {
    const tipo = 'prueba.reinicio';
    const consumidores = [`prueba-a-${sufijo}`, `prueba-b-${sufijo}`];
    const llamadas = new Map<string, number>();
    const suscripciones = new SuscripcionesEnMemoria();
    for (const consumidor of consumidores) {
      suscripciones.suscribir(consumidor, tipo, async () => {
        llamadas.set(consumidor, (llamadas.get(consumidor) ?? 0) + 1);
        await pausa(5);
      });
    }
    const eventos: string[] = [];
    for (let indice = 0; indice < 200; indice += 1) eventos.push(await insertarEnOutbox(entorno.dataSource, tipo));
    const { cola, nuevosTrabajadores } = pilaBullMQ(suscripciones);
    await crearRelay(entorno.dataSource, cola, suscripciones).ejecutar();
    const procesadosDe = async (consumidor: string) =>
      Number(
        (
          await entorno.dataSource.query(`SELECT count(*) AS n FROM sync.evento_procesado WHERE consumidor = $1 AND event_id = ANY($2::uuid[])`, [
            consumidor,
            eventos,
          ])
        )[0].n,
      );
    const totalProcesados = async () => (await procesadosDe(consumidores[0])) + (await procesadosDe(consumidores[1]));

    const conexionPrimero = crearConexionColas(REDIS_URL, () => undefined);
    const primero = nuevosTrabajadores(conexionPrimero);
    primero.iniciar();
    await esperarHasta(async () => (await totalProcesados()) >= 200, LIMITE_ESPERA_MS);
    await primero.cerrar(true);
    conexionPrimero.disconnect();
    expect(await totalProcesados()).toBeLessThan(400);

    // Los trabajos que quedaron activos se reentregan cuando BullMQ los detecta atascados (hasta ~60 s).
    const segundo = nuevosTrabajadores(conexionTrabajadores);
    segundo.iniciar();
    await esperarHasta(async () => (await totalProcesados()) === 400, 110_000);

    for (const consumidor of consumidores) {
      expect(await procesadosDe(consumidor)).toBe(200);
      expect(llamadas.get(consumidor)).toBe(200);
    }
    await segundo.cerrar();
    await cola.cerrar();
    await vaciarColas(consumidores);
  }, 150_000);

  /**
   * El primero inserta antes (seq menor) y confirma 2 s después de que el segundo confirmó.
   * `despachar` corre en paralelo desde antes de esos 2 s; recibe los dos event_id.
   */
  async function confirmarFueraDeOrden(tipo: string, despachar: (entregados: () => string[]) => Promise<void>) {
    const primeraTransaccion = entorno.dataSource.createQueryRunner();
    await primeraTransaccion.connect();
    await primeraTransaccion.startTransaction();
    const primero = await insertarEnOutbox(primeraTransaccion.manager, tipo);
    const segundo = await insertarEnOutbox(entorno.dataSource, tipo);
    const despacho = despachar(() => [primero, segundo]);
    await pausa(2000);
    await primeraTransaccion.commitTransaction();
    await primeraTransaccion.release();
    await despacho;
    return { primero, segundo };
  }
});
