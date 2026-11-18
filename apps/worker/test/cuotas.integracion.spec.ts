import 'reflect-metadata';
import { Module, type DynamicModule, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { AbrirPeriodoCuotas, ENTIDADES_IDN, registrarEsquemasIdn } from '@vitrina/plataforma/identidad';
import { InMemoryEventSchemaValidator, KernelInfraModule, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { ENTIDADES_ORG } from '@vitrina/plataforma/org';
import { ENTIDADES_CFG } from '@vitrina/plataforma/parametros';
import { ejecutarCuotasCli } from '../src/cli/cuotas.cli.js';
import { CuotasModule } from '../src/cuotas/cuotas.module.js';
import { COLA_CUOTAS, PATRON_CUOTAS, PROGRAMADOR_CUOTAS, TareaCuotas } from '../src/cuotas/tarea-cuotas.js';
import { crearBaseTemporal, describeConDb, type BaseTemporal } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const NOVIEMBRE = '2026-11';
const DICIEMBRE = '2026-12';

/** Lo mismo que arma WorkerModule para la tarea, sin el relay. */
@Module({})
class PruebaCuotasModule {
  static register(dataSource: DataSource): DynamicModule {
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasIdn(validator);
    return {
      module: PruebaCuotasModule,
      imports: [KernelInfraModule.register({ dataSource, validator }), CuotasModule.register({ dataSource, redisUrl: REDIS_URL, programar: true })],
    };
  }
}

describeConDb('Tarea mensual de cuotas en el worker (PostgreSQL 16 y Redis 7)', () => {
  let base: BaseTemporal;
  let dataSource: DataSource;
  // Se crean en beforeAll: el cuerpo del describe corre aunque la suite se salte.
  let conexion: Redis;
  let cola: Queue;
  let app: INestApplicationContext;
  const consultar = (sql: string, parametros: unknown[] = []) => dataSource.query(sql, parametros);

  const tenant = async (codigo: string, estado: string, plan?: string) => {
    const tenantId = uuidV7();
    await consultar(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $2, $2, $3, 1)`, [tenantId, codigo, estado]);
    if (plan) {
      await consultar(`INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, version) VALUES ($1, $2, 'REST', $3, 'ACTIVA', 1)`, [
        uuidV7(),
        tenantId,
        plan,
      ]);
    }
    return tenantId;
  };
  const cuotasDe = (tenantIds: string[], periodo: string) =>
    consultar('SELECT tenant_id, plan, incluidas, consumidas FROM idn.cuota WHERE tenant_id = ANY($1) AND periodo = $2 ORDER BY incluidas', [
      tenantIds,
      periodo,
    ]);

  beforeAll(async () => {
    base = await crearBaseTemporal();
    dataSource = new DataSource({ type: 'postgres', url: base.url, entities: [...ENTIDADES_IDN, ...ENTIDADES_ORG, ...ENTIDADES_CFG] });
    await dataSource.initialize();
    conexion = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    cola = new Queue(COLA_CUOTAS, { connection: conexion });
    await cola.removeJobScheduler(PROGRAMADOR_CUOTAS);
    // Definiciones del manifiesto PLAT 1.19.0.
    await consultar(`INSERT INTO seg.producto (codigo, nombre) VALUES ('PLAT', 'Plataforma') ON CONFLICT DO NOTHING`);
    await consultar(`INSERT INTO cfg.parametro_def (codigo, producto_codigo, descripcion, tipo, valor_defecto, alcance_maximo) VALUES
      ('plat.identidad.cuota_incluidas', 'PLAT', 'Consultas incluidas por plan', 'JSON', '{"BASICO": 200, "PRO": 500, "EMPRESA": 2000}', 'TENANT'),
      ('plat.identidad.cuota_umbral_aviso', 'PLAT', 'Porcentaje de aviso', 'NUMERO', '80', 'TENANT')`);
    app = await NestFactory.createApplicationContext(PruebaCuotasModule.register(dataSource), { logger: false, abortOnError: false });
  });

  afterAll(async () => {
    await app?.close();
    await cola?.removeJobScheduler(PROGRAMADOR_CUOTAS);
    await cola?.close();
    conexion?.disconnect();
    await dataSource?.destroy();
    await base?.borrar();
  });

  it('programa un solo trabajo el día 1 a las 00:05 de Lima', async () => {
    const programadores = await cola.getJobSchedulers();
    expect(programadores).toHaveLength(1);
    expect(programadores[0]).toMatchObject({ key: PROGRAMADOR_CUOTAS, pattern: PATRON_CUOTAS, tz: 'America/Lima' });
    expect(app.get(TareaCuotas)).toBeInstanceOf(TareaCuotas);
  });

  it('crea la cuota del periodo para cada tenant ACTIVO con su plan; correrla dos veces no duplica ni cambia consumidas', async () => {
    const empresa = await tenant('cuota-empresa', 'ACTIVO', 'EMPRESA');
    const sinSuscripcion = await tenant('cuota-sin-plan', 'ACTIVO');
    const suspendido = await tenant('cuota-suspendido', 'SUSPENDIDO', 'PRO');
    const abrir = app.get(AbrirPeriodoCuotas);

    const primera = await abrir.ejecutar(NOVIEMBRE);
    await consultar(`UPDATE idn.cuota SET consumidas = 37 WHERE tenant_id = $1 AND periodo = $2`, [empresa, NOVIEMBRE]);
    const segunda = await abrir.ejecutar(NOVIEMBRE);

    expect(primera).toMatchObject({ creadas: 2, fallidas: 0 });
    expect(segunda).toMatchObject({ creadas: 0, existentes: 2, fallidas: 0 });
    expect(await cuotasDe([empresa, sinSuscripcion, suspendido], NOVIEMBRE)).toEqual([
      { tenant_id: sinSuscripcion, plan: 'BASICO', incluidas: 200, consumidas: 0 },
      { tenant_id: empresa, plan: 'EMPRESA', incluidas: 2000, consumidas: 37 },
    ]);
  });

  it('cuotas:abrir --periodo 2026-12 abre diciembre para los tenants ACTIVO', async () => {
    const tenantId = await tenant('cuota-cli', 'ACTIVO', 'PRO');
    const logs: string[] = [];
    const errores: string[] = [];

    const codigo = await ejecutarCuotasCli(['--periodo', DICIEMBRE], { DATABASE_URL: base.url, REDIS_URL }, { log: (m) => logs.push(m), error: (m) => errores.push(m) });

    expect([codigo, errores]).toEqual([0, []]);
    expect(JSON.parse(logs[1])).toMatchObject({ periodo: DICIEMBRE, fallidas: 0 });
    expect(await cuotasDe([tenantId], DICIEMBRE)).toEqual([{ tenant_id: tenantId, plan: 'PRO', incluidas: 500, consumidas: 0 }]);
  });
});
