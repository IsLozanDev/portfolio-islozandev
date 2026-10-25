import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { Injectable, type INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import type { EventoEntregado } from '../src/domain/evento-entregado.js';
import { NombreConsumidor } from '../src/domain/nombre-consumidor.js';
import { EventosModule } from '../src/eventos.module.js';
import { crearConexionColas } from '../src/infrastructure/bullmq/conexion-redis.js';
import { SuscribirEvento } from '../src/interface/suscribir-evento.decorator.js';
import { crearEntornoEntrega, esperarHasta, type EntornoEntrega } from './support/entorno.js';
import { cursorActual, insertarEnOutbox, seqDe } from './support/relay.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const LIMITE_ESPERA_MS = 20_000;
const TIPO = 'prueba.modulo';
// Consumidor único por corrida: la cola de una corrida anterior en el mismo Redis no interfiere.
const CONSUMIDOR = `prueba-modulo-${randomBytes(3).toString('hex')}`;

@Injectable()
class ConsumidorDeModulo {
  readonly recibidos: string[] = [];

  @SuscribirEvento(TIPO, { consumidor: CONSUMIDOR })
  alRecibir(evento: EventoEntregado): Promise<void> {
    this.recibidos.push(evento.eventId);
    return Promise.resolve();
  }
}

describeConDb('EventosModule.registrarWorker con PostgreSQL 16 y Redis 7', () => {
  let entorno: EntornoEntrega;
  let app: INestApplicationContext;

  beforeAll(async () => {
    entorno = await crearEntornoEntrega();
    const modulo = await Test.createTestingModule({
      imports: [
        KernelInfraModule.register({ dataSource: entorno.dataSource, validator: new InMemoryEventSchemaValidator() }),
        EventosModule.registrarWorker({
          dataSource: entorno.dataSource,
          redisUrl: REDIS_URL,
          relay: { intervaloMs: 50, margenSeg: 0, lote: 500, rebarridoSeg: 60, ventanaSeg: 300 },
          reintentos: { intentos: 8, esperaBaseMs: 10, esperaMaximaMs: 40 },
          concurrencia: 2,
        }),
      ],
      providers: [ConsumidorDeModulo],
    }).compile();
    app = await modulo.init();
  });

  afterAll(async () => {
    const conexion = crearConexionColas(REDIS_URL, () => undefined);
    const cola = new Queue(NombreConsumidor.de(CONSUMIDOR).cola, { connection: conexion });
    await cola.obliterate({ force: true });
    await cola.close();
    await conexion.quit();
    await entorno.cerrar();
  });

  test('descubre el consumidor, el ciclo despacha el outbox y el Worker lo entrega una vez', async () => {
    const eventId = await insertarEnOutbox(entorno.dataSource, TIPO);

    await esperarHasta(async () => (await entorno.procesados(eventId)).length === 1, LIMITE_ESPERA_MS);

    expect(app.get(ConsumidorDeModulo).recibidos).toEqual([eventId]);
    expect(await cursorActual(entorno.dataSource)).toBe(await seqDe(entorno.dataSource, eventId));
  });

  test('al cerrar, detiene el ciclo: lo que llega después no se despacha', async () => {
    await app.close();
    const cursorAlCerrar = await cursorActual(entorno.dataSource);

    await insertarEnOutbox(entorno.dataSource, TIPO);
    await new Promise((resolver) => setTimeout(resolver, 300));

    expect(await cursorActual(entorno.dataSource)).toBe(cursorAlCerrar);
  });
});
