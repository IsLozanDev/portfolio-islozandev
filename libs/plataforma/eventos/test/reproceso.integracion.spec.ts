import { randomBytes } from 'node:crypto';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { SystemClock, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { ListarFallidos } from '../src/application/listar-fallidos.js';
import { RegistrarFallo } from '../src/application/registrar-fallo.js';
import { ReprocesarFallidos, type ResultadoReproceso } from '../src/application/reprocesar-fallidos.js';
import type { EventoEntregado } from '../src/domain/evento-entregado.js';
import { NombreConsumidor } from '../src/domain/nombre-consumidor.js';
import { ColaEventosBullMQ } from '../src/infrastructure/bullmq/cola-eventos.bullmq.js';
import { crearConexionColas, crearConexionProductor } from '../src/infrastructure/bullmq/conexion-redis.js';
import type { PoliticaReintentos } from '../src/infrastructure/bullmq/politica-reintentos.js';
import { TrabajadoresEventos } from '../src/infrastructure/bullmq/trabajadores-eventos.js';
import { FallidosRepositorioTypeOrm } from '../src/infrastructure/typeorm/fallidos.repositorio.js';
import { LecturaOutboxTypeOrm } from '../src/infrastructure/typeorm/lectura-outbox.typeorm.js';
import { crearEntornoEntrega, esperarHasta, SuscripcionesEnMemoria, type EntornoEntrega } from './support/entorno.js';
import { crearRelay, insertarEnOutbox } from './support/relay.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
// 3 intentos con 10 ms de backoff: un fallo completo tarda milisegundos.
const POLITICA: PoliticaReintentos = { intentos: 3, esperaBaseMs: 10, esperaMaximaMs: 40 };
const LIMITE_ESPERA_MS = 20_000;
const TIPO = 'cita.creada';
const ANA = '0193f3a0-0000-7000-8000-000000000901';

describeConDb('Reproceso de fallidos con PostgreSQL 16 y Redis 7 (TR-RF-095)', () => {
  let entorno: EntornoEntrega;
  let conexionTrabajadores: Redis;
  let conexionProductor: Redis;
  let cola: ColaEventosBullMQ;
  const consumidoresUsados: string[] = [];
  const trabajadoresIniciados: TrabajadoresEventos[] = [];
  // Consumidores únicos por corrida: las colas de una corrida anterior en el mismo Redis no interfieren.
  const sufijo = randomBytes(3).toString('hex');
  const consumidorUnico = (nombre: string) => {
    const consumidor = `${nombre}-${sufijo}`;
    consumidoresUsados.push(consumidor);
    return consumidor;
  };

  beforeAll(async () => {
    entorno = await crearEntornoEntrega();
    conexionTrabajadores = crearConexionColas(REDIS_URL, () => undefined);
    conexionProductor = crearConexionProductor(REDIS_URL, () => undefined);
    cola = new ColaEventosBullMQ(conexionProductor, POLITICA, () => undefined);
    // reprocesado_por referencia a seg.usuario.
    await entorno.dataSource.query(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, 'ana@prueba.pe', 'Ana', 'INTERNO', 'ACTIVO')`, [ANA]);
  });

  afterAll(async () => {
    await Promise.all(trabajadoresIniciados.map((trabajadores) => trabajadores.cerrar()));
    await cola.cerrar();
    for (const consumidor of consumidoresUsados) {
      const colaDePrueba = new Queue(NombreConsumidor.de(consumidor).cola, { connection: conexionTrabajadores });
      await colaDePrueba.obliterate({ force: true });
      await colaDePrueba.close();
    }
    await conexionTrabajadores.quit();
    await conexionProductor.quit();
    await entorno.cerrar();
  });

  const enTenant = <T>(tenantId: string, trabajo: () => Promise<T>) => entorno.dependencias.contexto.run({ tenantId }, trabajo);

  function reprocesar(tenantId: string, ids: string[]): Promise<ResultadoReproceso> {
    const { unidadDeTrabajo, dependencias } = entorno;
    const caso = new ReprocesarFallidos({
      unidadDeTrabajo,
      reloj: new SystemClock(),
      fallidos: new FallidosRepositorioTypeOrm(unidadDeTrabajo, dependencias.contexto),
      outbox: new LecturaOutboxTypeOrm(unidadDeTrabajo, dependencias.contexto),
      cola,
      informar: () => undefined,
    });
    return enTenant(tenantId, () => caso.ejecutar({ ids, actorId: ANA }));
  }

  const listar = (tenantId: string, consulta = {}) => {
    const { unidadDeTrabajo, dependencias } = entorno;
    const caso = new ListarFallidos({ unidadDeTrabajo, fallidos: new FallidosRepositorioTypeOrm(unidadDeTrabajo, dependencias.contexto) });
    return enTenant(tenantId, () => caso.ejecutar(consulta));
  };

  const eventoDelOutbox = (tenantId: string, eventId: string) =>
    enTenant(tenantId, () =>
      entorno.unidadDeTrabajo.run(async () => {
        const evento = await new LecturaOutboxTypeOrm(entorno.unidadDeTrabajo, entorno.dependencias.contexto).buscar(eventId);
        if (!evento) throw new Error(`El evento ${eventId} no está en el outbox`);
        return evento;
      }),
    );

  /** Un evento en el outbox con su fila `FALLIDO` de 3 intentos, sin pasar por BullMQ. */
  async function fallidoDe(consumidor: string, tenantId: string): Promise<{ id: string; evento: EventoEntregado }> {
    const evento = await eventoDelOutbox(tenantId, await insertarEnOutbox(entorno.dataSource, TIPO, tenantId));
    await new RegistrarFallo(entorno.dependencias).ejecutar({ consumidor, evento, error: 'el consumidor sigue caído', intentos: POLITICA.intentos });
    const [fila] = await entorno.dataSource.query(`SELECT id FROM sync.evento_fallido WHERE consumidor = $1 AND event_id = $2`, [consumidor, evento.eventId]);
    return { id: fila.id, evento };
  }

  /** Trabajadores BullMQ reales de un consumidor que falla mientras `caido()` sea true. */
  function consumidorConCaida(consumidor: string, caido: () => boolean) {
    const llamadas: string[] = [];
    const suscripciones = new SuscripcionesEnMemoria();
    suscripciones.suscribir(consumidor, TIPO, async (evento) => {
      if (caido()) throw new Error('el consumidor sigue caído');
      llamadas.push(evento.eventId);
    });
    const trabajadores = new TrabajadoresEventos({ conexion: conexionTrabajadores, concurrencia: 4, politica: POLITICA }, suscripciones, entorno.entregarCon(suscripciones));
    trabajadores.iniciar();
    trabajadoresIniciados.push(trabajadores);
    return { llamadas, suscripciones };
  }

  const estadosDe = async (ids: string[]): Promise<string[]> =>
    (await entorno.dataSource.query(`SELECT estado FROM sync.evento_fallido WHERE id = ANY($1::uuid[]) ORDER BY id`, [ids])).map(
      (fila: { estado: string }) => fila.estado,
    );

  test('TR-CA-233: 12 fallidos por un error que se corrige; reprocesarlos los deja en PROCESADO y fuera de la lista', async () => {
    const consumidor = consumidorUnico('prueba-a');
    const tenantId = uuidV7();
    let caido = true;
    const { llamadas, suscripciones } = consumidorConCaida(consumidor, () => caido);
    for (let indice = 0; indice < 12; indice += 1) await insertarEnOutbox(entorno.dataSource, TIPO, tenantId);

    await crearRelay(entorno.dataSource, cola, suscripciones).ejecutar();
    await esperarHasta(async () => (await listar(tenantId, { consumidor })).length === 12, LIMITE_ESPERA_MS);
    const ids = (await listar(tenantId, { consumidor })).map((fallido) => fallido.id);
    caido = false;

    const resultado = await reprocesar(tenantId, ids);

    expect(resultado).toEqual({ reprocesados: ids, omitidos: [] });
    await esperarHasta(async () => (await estadosDe(ids)).every((estado) => estado === 'PROCESADO'), LIMITE_ESPERA_MS);
    expect(llamadas).toHaveLength(12);
    expect(await listar(tenantId, { consumidor })).toEqual([]);
    const [auditoria] = await entorno.dataSource.query(`SELECT DISTINCT reprocesado_por FROM sync.evento_fallido WHERE id = ANY($1::uuid[])`, [ids]);
    expect(auditoria.reprocesado_por).toBe(ANA);
  });

  test('TR-CA-234: un fallido que ya tiene fila de procesado pasa a PROCESADO sin llamar al manejador', async () => {
    const consumidor = consumidorUnico('prueba-b');
    const tenantId = uuidV7();
    const { id, evento } = await fallidoDe(consumidor, tenantId);
    await entorno.dataSource.query(`INSERT INTO sync.evento_procesado (consumidor, event_id, tenant_id) VALUES ($1, $2, $3)`, [consumidor, evento.eventId, tenantId]);
    const { llamadas } = consumidorConCaida(consumidor, () => false);

    expect(await reprocesar(tenantId, [id])).toEqual({ reprocesados: [id], omitidos: [] });

    await esperarHasta(async () => (await estadosDe([id]))[0] === 'PROCESADO', LIMITE_ESPERA_MS);
    expect(llamadas).toEqual([]);
  });

  test('omite el id de otro tenant (NO_ENCONTRADO) y el que está en REPROCESANDO (NO_FALLIDO)', async () => {
    // Sin trabajadores: el reproceso queda en REPROCESANDO.
    const consumidor = consumidorUnico('prueba-sin-worker');
    const [tenantA, tenantB] = [uuidV7(), uuidV7()];
    const deB = await fallidoDe(consumidor, tenantB);
    const deA = await fallidoDe(consumidor, tenantA);
    await reprocesar(tenantA, [deA.id]);

    const resultado = await reprocesar(tenantA, [deB.id, deA.id, uuidV7()]);

    expect(resultado.reprocesados).toEqual([]);
    expect(resultado.omitidos).toEqual([
      { id: deB.id, motivo: 'NO_ENCONTRADO' },
      { id: deA.id, motivo: 'NO_FALLIDO' },
      { id: resultado.omitidos[2].id, motivo: 'NO_ENCONTRADO' },
    ]);
    expect(await estadosDe([deB.id])).toEqual(['FALLIDO']);
    expect(await listar(tenantA, { consumidor, estado: 'REPROCESANDO' })).toHaveLength(1);
  });

  test('un reproceso que vuelve a fallar queda FALLIDO con los intentos sumados', async () => {
    const consumidor = consumidorUnico('prueba-c');
    const tenantId = uuidV7();
    const { id } = await fallidoDe(consumidor, tenantId);
    consumidorConCaida(consumidor, () => true);

    await reprocesar(tenantId, [id]);

    await esperarHasta(async () => {
      const [fila] = await entorno.dataSource.query(`SELECT estado, intentos FROM sync.evento_fallido WHERE id = $1`, [id]);
      return fila.estado === 'FALLIDO' && fila.intentos === POLITICA.intentos * 2;
    }, LIMITE_ESPERA_MS);
  });

  test('la lista filtra por consumidor, tipo y estado, la más reciente primero, con límite', async () => {
    const consumidor = consumidorUnico('prueba-lista');
    const tenantId = uuidV7();
    const primero = await fallidoDe(consumidor, tenantId);
    const segundo = await fallidoDe(consumidor, tenantId);

    expect((await listar(tenantId, { consumidor })).map((fallido) => fallido.id)).toEqual([segundo.id, primero.id]);
    expect((await listar(tenantId, { consumidor, limite: 1 })).map((fallido) => fallido.id)).toEqual([segundo.id]);
    expect(await listar(tenantId, { consumidor, eventType: 'otro.tipo' })).toEqual([]);
    expect(await listar(tenantId, { consumidor, estado: 'PROCESADO' })).toEqual([]);
    expect(await listar(uuidV7(), { consumidor })).toEqual([]);
  });
});
