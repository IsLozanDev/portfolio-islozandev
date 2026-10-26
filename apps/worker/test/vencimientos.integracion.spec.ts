import 'reflect-metadata';
import { Module, type DynamicModule, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { InMemoryEventSchemaValidator, KernelInfraModule, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { ENTIDADES_ORG, registrarEsquemasOrg, RevisarVencimientos } from '@vitrina/plataforma/org';
import { ENTIDADES_CFG } from '@vitrina/plataforma/parametros';
import { COLA_VENCIMIENTOS, PATRON_VENCIMIENTOS, PROGRAMADOR_VENCIMIENTOS, TareaVencimientos } from '../src/vencimientos/tarea-vencimientos.js';
import { VencimientosModule } from '../src/vencimientos/vencimientos.module.js';
import { crearBaseTemporal, describeConDb, type BaseTemporal } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const HOY = '2026-10-10';

/** Lo mismo que arma WorkerModule para la tarea, sin el relay. */
@Module({})
class PruebaVencimientosModule {
  static register(dataSource: DataSource): DynamicModule {
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasOrg(validator);
    return {
      module: PruebaVencimientosModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        VencimientosModule.register({ dataSource, redisUrl: REDIS_URL, programar: true }),
      ],
    };
  }
}

describeConDb('Tarea de vencimientos en el worker (PostgreSQL 16 y Redis 7)', () => {
  let base: BaseTemporal;
  let dataSource: DataSource;
  // Se crean en beforeAll: el cuerpo del describe corre aunque la suite se salte.
  let conexion: Redis;
  let cola: Queue;
  const apps: INestApplicationContext[] = [];
  const consultar = (sql: string, parametros: unknown[] = []) => dataSource.query(sql, parametros);
  const arrancar = async () => {
    const app = await NestFactory.createApplicationContext(PruebaVencimientosModule.register(dataSource), { logger: false, abortOnError: false });
    apps.push(app);
    return app;
  };
  /** Tenant en PRUEBA con una suscripción que venció hace 3 días. */
  const tenantVencido = async (codigo: string) => {
    const tenantId = uuidV7();
    await consultar(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $2, $2, 'PRUEBA', 1)`, [tenantId, codigo]);
    await consultar(`INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, vigente_hasta, version) VALUES ($1, $2, 'PSI', 'BASICO', 'PRUEBA', '2026-10-07', 1)`, [
      uuidV7(),
      tenantId,
    ]);
    return tenantId;
  };

  beforeAll(async () => {
    base = await crearBaseTemporal();
    dataSource = new DataSource({ type: 'postgres', url: base.url, entities: [...ENTIDADES_ORG, ...ENTIDADES_CFG] });
    await dataSource.initialize();
    conexion = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    cola = new Queue(COLA_VENCIMIENTOS, { connection: conexion });
    await cola.removeJobScheduler(PROGRAMADOR_VENCIMIENTOS);
    // Definición del manifiesto PLAT 1.5.0: defecto 5, máximo TENANT.
    await consultar(`INSERT INTO seg.producto (codigo, nombre) VALUES ('PLAT', 'Plataforma') ON CONFLICT DO NOTHING`);
    await consultar(`INSERT INTO cfg.parametro_def (codigo, producto_codigo, descripcion, tipo, valor_defecto, alcance_maximo)
                     VALUES ('plat.suscripcion.dias_gracia', 'PLAT', 'Días tras el vencimiento antes de suspender el tenant', 'NUMERO', '5', 'TENANT')`);
  });

  afterAll(async () => {
    for (const app of apps) await app.close();
    await cola?.removeJobScheduler(PROGRAMADOR_VENCIMIENTOS);
    await cola?.close();
    conexion?.disconnect();
    await dataSource?.destroy();
    await base?.borrar();
  });

  it('con dos workers arrancados queda un solo programador, a las 06:00 de Lima', async () => {
    await arrancar();
    await arrancar();

    const programadores = await cola.getJobSchedulers();
    expect(programadores).toHaveLength(1);
    expect(programadores[0]).toMatchObject({ key: PROGRAMADOR_VENCIMIENTOS, pattern: PATRON_VENCIMIENTOS, tz: 'America/Lima' });
    expect(apps[0].get(TareaVencimientos)).toBeInstanceOf(TareaVencimientos);
  });

  it('dias_gracia fijado en 3 para un tenant lo suspende a los 3 días; otro con el defecto (5) sigue en PRUEBA', async () => {
    const corto = await tenantVencido('gracia-tres');
    const normal = await tenantVencido('gracia-defecto');
    const [{ id: usuario }] = await consultar(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, 'cfg@vitrina.pe', 'Cfg', 'INTERNO', 'ACTIVO') RETURNING id`, [uuidV7()]);
    await consultar(`INSERT INTO cfg.parametro_valor (id, tenant_id, codigo, alcance, valor, modificado_por) VALUES ($1, $2, 'plat.suscripcion.dias_gracia', 'TENANT', '3', $3)`, [
      uuidV7(),
      corto,
      usuario,
    ]);
    const app = apps[0] ?? (await arrancar());

    const resultado = await app.get(RevisarVencimientos).ejecutar(HOY);

    expect(resultado).toMatchObject({ fallidos: 0, suspendidos: 1 });
    const estados = await consultar('SELECT codigo, estado FROM org.tenant WHERE id = ANY($1) ORDER BY codigo', [[corto, normal]]);
    expect(estados).toEqual([
      { codigo: 'gracia-defecto', estado: 'PRUEBA' },
      { codigo: 'gracia-tres', estado: 'SUSPENDIDO' },
    ]);
  });
});
