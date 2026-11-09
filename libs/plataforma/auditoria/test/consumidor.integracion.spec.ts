import 'reflect-metadata';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import type { EventPublisher, TenantContext, TenantScope } from '@vitrina/plataforma/kernel';
import { EVENT_PUBLISHER, InMemoryEventSchemaValidator, KernelInfraModule, TENANT_CONTEXT, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { EventosModule } from '@vitrina/plataforma/eventos';
import { AuditoriaModule } from '../src/auditoria.module.js';
import { EVENTOS_AUDITADOS } from '../src/interface/auditoria.consumidor.js';
import { crearEntornoAuditoria, type EntornoAuditoria } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

// Redis 7 de docker-compose (local) o del servicio de CI. Necesita además PostgreSQL: corre solo con TEST_DATABASE_URL.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const COLA_AUDITORIA = 'evt-auditoria';
const LIMITE_ESPERA_MS = 20_000;
const PAUSA_MS = 50;
const NO_AUDITADOS = ['seq.numero.emitido', 'suscripcion.por_vencer'] as const;

async function esperarHasta(condicion: () => Promise<boolean>): Promise<void> {
  const limite = Date.now() + LIMITE_ESPERA_MS;
  while (!(await condicion())) {
    if (Date.now() > limite) throw new Error(`La condición no se cumplió en ${LIMITE_ESPERA_MS} ms`);
    await new Promise((resolver) => setTimeout(resolver, PAUSA_MS));
  }
}

async function vaciarColaAuditoria(): Promise<void> {
  const cola = new Queue(COLA_AUDITORIA, { connection: { url: REDIS_URL } });
  await cola.obliterate({ force: true });
  await cola.close();
}

describeConDb('Consumidor auditoria con PostgreSQL 16 y Redis 7 (TR-RN-034, TR-RNF-008)', () => {
  let entorno: EntornoAuditoria;
  let app: INestApplicationContext;
  const tenantId = uuidV7();
  const conActor: TenantScope = { tenantId, branchId: uuidV7(), actorId: uuidV7(), ip: '190.42.10.8', traceId: '4bf92f3577b34da6a3ce929d0e0e4736' };

  beforeAll(async () => {
    await vaciarColaAuditoria();
    entorno = await crearEntornoAuditoria();
    const validador = new InMemoryEventSchemaValidator();
    for (const tipo of [...EVENTOS_AUDITADOS, ...NO_AUDITADOS]) validador.register(tipo, 1, { type: 'object' });
    const modulo = await Test.createTestingModule({
      imports: [
        KernelInfraModule.register({ dataSource: entorno.dataSource, validator: validador }),
        EventosModule.registrarWorker({
          dataSource: entorno.dataSource,
          redisUrl: REDIS_URL,
          relay: { intervaloMs: PAUSA_MS, margenSeg: 0, lote: 500, rebarridoSeg: 60, ventanaSeg: 300 },
          reintentos: { intentos: 3, esperaBaseMs: 10, esperaMaximaMs: 40 },
          concurrencia: 2,
        }),
        AuditoriaModule.registrarWorker(),
      ],
    }).compile();
    app = await modulo.init();
  });

  afterAll(async () => {
    await app?.close();
    await vaciarColaAuditoria();
    await entorno?.cerrar();
  });

  /** Publica como lo haría ORG: con OutboxPublisher, en una transacción con el alcance dado. */
  async function publicar(alcance: TenantScope, tipo: string, payload: Record<string, unknown> = {}): Promise<string> {
    const aggregateId = uuidV7();
    const contexto = app.get<TenantContext>(TENANT_CONTEXT);
    const unidadDeTrabajo = app.get(TypeOrmUnitOfWork);
    const publicador = app.get<EventPublisher>(EVENT_PUBLISHER);
    await contexto.run(alcance, () =>
      unidadDeTrabajo.run(() =>
        publicador.publish({ eventType: tipo, aggregateType: tipo.split('.')[0], aggregateId, aggregateVersion: 1, schemaVersion: 1, payload, occurredAt: new Date() }),
      ),
    );
    return aggregateId;
  }

  const filasDe = async (aggregateId: string) => (await entorno.filas(tenantId)).filter((fila) => fila.entidad_id === aggregateId);
  const eventIdDe = async (aggregateId: string): Promise<{ event_id: string; seq: string }> =>
    (await entorno.dataSource.query(`SELECT event_id, seq::text AS seq FROM sync.outbox WHERE aggregate_id = $1`, [aggregateId]))[0];

  it('sucursal.creada con actor, IP y trace deja una fila EVENTO con el payload enmascarado como después', async () => {
    const sucursalId = await publicar(conActor, 'sucursal.creada', { nombre: 'Miraflores', clave: 'no' });
    await esperarHasta(async () => (await filasDe(sucursalId)).length === 1);

    const [fila] = await filasDe(sucursalId);
    expect(fila).toMatchObject({
      tipo: 'OPERACION',
      origen: 'EVENTO',
      event_id: (await eventIdDe(sucursalId)).event_id,
      accion: 'sucursal.creada',
      entidad_tipo: 'sucursal',
      entidad_id: sucursalId,
      usuario_id: conActor.actorId,
      sucursal_id: conActor.branchId,
      ip: conActor.ip,
      trace_id: conActor.traceId,
      antes: null,
      despues: { nombre: 'Miraflores', clave: '***' },
    });
  });

  it('cada tipo de EVENTOS_AUDITADOS deja su fila; seq.numero.emitido y suscripcion.por_vencer no', async () => {
    const noAuditados = await Promise.all(NO_AUDITADOS.map((tipo) => publicar(conActor, tipo)));
    const auditados = new Map<string, string>();
    for (const tipo of EVENTOS_AUDITADOS) auditados.set(tipo, await publicar(conActor, tipo));

    await esperarHasta(async () => (await Promise.all([...auditados.values()].map(filasDe))).every((filas) => filas.length === 1));
    for (const [tipo, aggregateId] of auditados) expect((await filasDe(aggregateId))[0].accion).toBe(tipo);
    // El relay entrega por seq: los no auditados se publicaron antes y ya pasaron.
    for (const aggregateId of noAuditados) expect(await filasDe(aggregateId)).toHaveLength(0);
  });

  it('un evento del sistema queda con usuario_id NULL', async () => {
    const tenantCreado = await publicar({ tenantId }, 'tenant.creado');
    await esperarHasta(async () => (await filasDe(tenantCreado)).length === 1);
    expect((await filasDe(tenantCreado))[0]).toMatchObject({ usuario_id: null, sucursal_id: null, ip: null, trace_id: null });
  });

  it('un evento reentregado deja una sola fila', async () => {
    const unidadId = await publicar(conActor, 'unidad.creada');
    await esperarHasta(async () => (await filasDe(unidadId)).length === 1);

    // Reentrega real: sin el trabajo completado en Redis y con el cursor antes del evento, el relay lo vuelve a encolar.
    await vaciarColaAuditoria();
    const { seq } = await eventIdDe(unidadId);
    await entorno.dataSource.query(`UPDATE sync.relay_cursor SET ultimo_seq = $1 WHERE relay = 'principal'`, [BigInt(seq) - 1n]);
    const cola = new Queue(COLA_AUDITORIA, { connection: { url: REDIS_URL } });
    try {
      await esperarHasta(async () => (await cola.getCompletedCount()) >= 1);
    } finally {
      await cola.close();
    }
    expect(await filasDe(unidadId)).toHaveLength(1);
  });
});
