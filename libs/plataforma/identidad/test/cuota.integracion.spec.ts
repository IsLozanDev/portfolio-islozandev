import type { EventSchemaValidator } from '@vitrina/plataforma/kernel';
import { AlsTenantContext, OutboxPublisher, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { ControlCuota } from '../src/application/control-cuota.js';
import { ENTIDADES_IDN } from '../src/infrastructure/typeorm/entidades.js';
import { RepositorioCuotasTypeOrm } from '../src/infrastructure/typeorm/cuota.repositorio.js';
import { ConfiguracionCuotaFija, PlanFijo } from './support/cuotas.js';
import { RelojFalso } from './support/dobles.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const OCTUBRE = '2026-10';
const RESERVAS_EN_PARALELO = 50;
const CONSULTAS_RESTANTES = 10;

// Los esquemas de los eventos se registran en las apps (paso 4): aquí se prueba solo la escritura en el outbox.
const validadorPermisivo: EventSchemaValidator = { validate: () => undefined };

describeConDb('ControlCuota con TypeORM (TR-RF-047, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let control: ControlCuota;

  const reservarComo = (tenantId: string) =>
    contexto.run({ tenantId }, () => unidadDeTrabajo.run(() => control.reservar(tenantId)));
  const liberarComo = (tenantId: string) => contexto.run({ tenantId }, () => unidadDeTrabajo.run(() => control.liberar(tenantId)));

  const sembrar = (tenantId: string, incluidas: number, consumidas: number) =>
    dataSource.query(`INSERT INTO idn.cuota (tenant_id, periodo, plan, incluidas, consumidas) VALUES ($1, $2, 'PRO', $3, $4)`, [
      tenantId,
      OCTUBRE,
      incluidas,
      consumidas,
    ]);
  const cuotaDe = async (tenantId: string) =>
    (await dataSource.query(`SELECT * FROM idn.cuota WHERE tenant_id = $1 AND periodo = $2`, [tenantId, OCTUBRE]))[0];
  const eventosDe = async (tenantId: string): Promise<{ event_type: string; payload: Record<string, unknown> }[]> =>
    dataSource.query(`SELECT event_type, payload FROM sync.outbox WHERE tenant_id = $1 ORDER BY seq`, [tenantId]);

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    // Más conexiones que reservas a la vez: cada una es una transacción propia.
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_IDN, extra: { max: 20 } });
    await dataSource.initialize();
    contexto = new AlsTenantContext();
    unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
    control = new ControlCuota({
      repositorio: new RepositorioCuotasTypeOrm(unidadDeTrabajo),
      planDelTenant: new PlanFijo('PRO'),
      configuracion: new ConfiguracionCuotaFija(),
      publicador: new OutboxPublisher(unidadDeTrabajo, contexto, validadorPermisivo, { next: uuidV7 }),
      reloj: new RelojFalso(new Date('2026-10-16T12:00:00-05:00')),
    });
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('con 10 restantes, 50 reservas en paralelo dan exactamente 10 true, consumidas = incluidas y cada aviso una vez', async () => {
    const tenantId = uuidV7();
    await sembrar(tenantId, 500, 500 - CONSULTAS_RESTANTES);

    const resultados = await Promise.all(Array.from({ length: RESERVAS_EN_PARALELO }, () => reservarComo(tenantId)));

    expect(resultados.filter(Boolean)).toHaveLength(CONSULTAS_RESTANTES);
    expect(await cuotaDe(tenantId)).toMatchObject({ incluidas: 500, consumidas: 500 });
    // 490 de 500 ya pasa el 80 %: la primera reserva avisa el umbral y la última, la agotada. Una vez cada uno.
    expect((await eventosDe(tenantId)).map((evento) => evento.event_type)).toEqual(['cuota.umbral_alcanzado', 'cuota.agotada']);
  });

  it('el umbral se publica una sola vez aunque varias reservas concurrentes lo crucen', async () => {
    const tenantId = uuidV7();
    await sembrar(tenantId, 500, 395);

    await Promise.all(Array.from({ length: 20 }, () => reservarComo(tenantId)));

    const eventos = await eventosDe(tenantId);
    expect(eventos.map((evento) => evento.event_type)).toEqual(['cuota.umbral_alcanzado']);
    expect(eventos[0].payload).toMatchObject({ tenant_id: tenantId, periodo: OCTUBRE, incluidas: 500, umbral: 80 });
    expect(await cuotaDe(tenantId)).toMatchObject({ consumidas: 415 });
  });

  it('TR-CA-120: la consulta 400 de 500 deja 400 y escribe el umbral con 80 % en el outbox', async () => {
    const tenantId = uuidV7();
    await sembrar(tenantId, 500, 399);

    expect(await reservarComo(tenantId)).toBe(true);

    expect(await cuotaDe(tenantId)).toMatchObject({ consumidas: 400 });
    expect(await eventosDe(tenantId)).toEqual([
      {
        event_type: 'cuota.umbral_alcanzado',
        payload: { tenant_id: tenantId, periodo: OCTUBRE, incluidas: 500, consumidas: 400, porcentaje: 80, umbral: 80 },
      },
    ]);
  });

  it('sin fila del periodo la crea con las incluidas de su plan y reserva una', async () => {
    const tenantId = uuidV7();

    expect(await reservarComo(tenantId)).toBe(true);

    expect(await cuotaDe(tenantId)).toMatchObject({ plan: 'PRO', incluidas: 500, consumidas: 1, version: 1 });
  });

  it('liberar devuelve la unidad y no baja de 0', async () => {
    const tenantId = uuidV7();
    await sembrar(tenantId, 500, 0);

    await reservarComo(tenantId);
    await liberarComo(tenantId);
    await liberarComo(tenantId);

    expect(await cuotaDe(tenantId)).toMatchObject({ consumidas: 0 });
  });
});
