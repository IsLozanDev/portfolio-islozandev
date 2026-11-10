import 'reflect-metadata';
import { Module, type DynamicModule, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { ENTIDADES_AUDITORIA, registrarEsquemasAud } from '@vitrina/plataforma/auditoria';
import { InMemoryEventSchemaValidator, KernelInfraModule, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { COLA_VERIFICACION, PATRON_VERIFICACION_DEFECTO, PROGRAMADOR_VERIFICACION, TareaVerificacionIntegridad } from '../src/auditoria/tarea-verificacion.js';
import { VerificacionModule } from '../src/auditoria/verificacion.module.js';
import { ejecutarAuditoriaCli } from '../src/cli/auditoria.cli.js';
import { crearBaseTemporal, describeConDb, type BaseTemporal } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const FILAS = 6;

/** Lo mismo que arma WorkerModule para la verificación, sin el relay. */
@Module({})
class PruebaVerificacionModule {
  static register(dataSource: DataSource): DynamicModule {
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasAud(validator);
    return {
      module: PruebaVerificacionModule,
      imports: [KernelInfraModule.register({ dataSource, validator }), VerificacionModule.register({ dataSource, redisUrl: REDIS_URL, patron: PATRON_VERIFICACION_DEFECTO })],
    };
  }
}

describeConDb('Verificación de integridad en el worker (spec 20b; PostgreSQL 16 y Redis 7)', () => {
  let base: BaseTemporal;
  let dataSource: DataSource;
  let conexion: Redis;
  let cola: Queue;
  const apps: INestApplicationContext[] = [];
  const consultar = (sql: string, parametros: unknown[] = []) => dataSource.query(sql, parametros);
  const silencio = { log: () => undefined, error: () => undefined };

  /** Tenant con una cadena de FILAS operaciones. */
  async function tenantConCadena(): Promise<string> {
    const tenantId = uuidV7();
    await consultar(
      `INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, ocurrido_en)
       SELECT gen_random_uuid(), $1, 'OPERACION', 'DIRECTO', 'rest.venta.anular', 'venta', 'V-' || serie, now() FROM generate_series(1, ${FILAS}) AS serie`,
      [tenantId],
    );
    return tenantId;
  }

  beforeAll(async () => {
    base = await crearBaseTemporal();
    dataSource = new DataSource({ type: 'postgres', url: base.url, entities: [...ENTIDADES_AUDITORIA] });
    await dataSource.initialize();
    conexion = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    cola = new Queue(COLA_VERIFICACION, { connection: conexion });
    await cola.removeJobScheduler(PROGRAMADOR_VERIFICACION);
  });

  afterAll(async () => {
    for (const app of apps) await app.close();
    await cola?.removeJobScheduler(PROGRAMADOR_VERIFICACION);
    await cola?.close();
    conexion?.disconnect();
    await dataSource?.destroy();
    await base?.borrar();
  });

  it('con dos workers arrancados queda un solo programador, a las 03:30 de Lima', async () => {
    for (let indice = 0; indice < 2; indice += 1) {
      apps.push(await NestFactory.createApplicationContext(PruebaVerificacionModule.register(dataSource), { logger: false, abortOnError: false }));
    }
    const programadores = await cola.getJobSchedulers();
    expect(programadores).toHaveLength(1);
    expect(programadores[0]).toMatchObject({ key: PROGRAMADOR_VERIFICACION, pattern: '30 3 * * *', tz: 'America/Lima' });
    expect(apps[0].get(TareaVerificacionIntegridad)).toBeInstanceOf(TareaVerificacionIntegridad);
  });

  it('auditoria:verificar --completa sobre una cadena sana termina en 0 y sobre una rota en 1', async () => {
    const sano = await tenantConCadena();
    const roto = await tenantConCadena();
    await consultar(`BEGIN;
      ALTER TABLE aud.evento_auditoria DISABLE TRIGGER evento_auditoria_solo_insercion;
      UPDATE aud.evento_auditoria SET despues = '{"total": 0}' WHERE tenant_id = '${roto}' AND numero = 3;
      ALTER TABLE aud.evento_auditoria ENABLE TRIGGER evento_auditoria_solo_insercion;
      COMMIT;`);
    const env = { DATABASE_URL: base.url };

    expect(await ejecutarAuditoriaCli(['--tenant', sano, '--completa'], env, silencio)).toBe(0);
    expect(await ejecutarAuditoriaCli(['--tenant', roto, '--completa'], env, silencio)).toBe(1);
    expect(await consultar('SELECT estado, numero_roto, motivo FROM aud.verificacion_integridad WHERE tenant_id = $1', [roto])).toEqual([
      { estado: 'ROTA', numero_roto: '3', motivo: 'HASH' },
    ]);
    expect(await consultar(`SELECT count(*)::int AS eventos FROM sync.outbox WHERE tenant_id = $1 AND event_type = 'aud.integridad.rota'`, [roto])).toEqual([{ eventos: 1 }]);
  });
});
