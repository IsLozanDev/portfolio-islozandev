import { DataSource } from 'typeorm';
import { MissingTenantContextError, NoActiveTransactionError } from '@vitrina/plataforma/kernel';
import { AlsTenantContext } from '../src/als-tenant-context.js';
import { TypeOrmUnitOfWork } from '../src/typeorm-unit-of-work.js';
import { createTempDb, type TempDb } from './support/temp-db.js';

const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-0000-0000-000000000002';

describe('TypeOrmUnitOfWork (PostgreSQL 16)', () => {
  let db: TempDb;
  let dataSource: DataSource;
  let tenants: AlsTenantContext;
  let uow: TypeOrmUnitOfWork;

  beforeAll(async () => {
    db = await createTempDb();
    // Un solo cliente en el pool: si el SET LOCAL se filtrara, la siguiente consulta lo vería.
    dataSource = new DataSource({ type: 'postgres', url: db.url, extra: { max: 1 } });
    await dataSource.initialize();
    await dataSource.query('CREATE TABLE uow_prueba (id int)');
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await db?.drop();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE uow_prueba');
    tenants = new AlsTenantContext();
    uow = new TypeOrmUnitOfWork(dataSource, tenants);
  });

  const tenantActual = async (q: { query: DataSource['query'] }): Promise<string | null> =>
    (await q.query("SELECT current_setting('app.tenant_id', true) AS t"))[0].t;
  const filas = async (): Promise<number> => Number((await dataSource.query('SELECT count(*) AS n FROM uow_prueba'))[0].n);

  it('fija app.tenant_id dentro de run y lo deja vacío después', async () => {
    const dentro = await tenants.run({ tenantId: TENANT_A }, () => uow.run(() => tenantActual(uow.manager)));
    expect(dentro).toBe(TENANT_A);
    expect(await tenantActual(dataSource)).toBeFalsy();
  });

  it('dos run concurrentes de tenants distintos ven cada uno el suyo', async () => {
    const ver = (tenantId: string) => tenants.run({ tenantId }, () => uow.run(() => tenantActual(uow.manager)));
    expect(await Promise.all([ver(TENANT_A), ver(TENANT_B)])).toEqual([TENANT_A, TENANT_B]);
  });

  it('revierte la transacción si work lanza', async () => {
    await expect(
      tenants.run({ tenantId: TENANT_A }, () =>
        uow.run(async () => {
          await uow.manager.query('INSERT INTO uow_prueba VALUES (1)');
          throw new Error('falla de negocio');
        }),
      ),
    ).rejects.toThrow('falla de negocio');
    expect(await filas()).toBe(0);
  });

  it('confirma la transacción si work termina', async () => {
    await tenants.run({ tenantId: TENANT_A }, () => uow.run(() => uow.manager.query('INSERT INTO uow_prueba VALUES (1)')));
    expect(await filas()).toBe(1);
  });

  it('run sin tenant lanza MissingTenantContextError y no abre transacción', async () => {
    let transacciones = 0;
    const original = dataSource.transaction.bind(dataSource) as (...args: unknown[]) => Promise<unknown>;
    dataSource.transaction = ((...args: unknown[]) => {
      transacciones += 1;
      return original(...args);
    }) as typeof dataSource.transaction;
    try {
      await expect(uow.run(async () => 1)).rejects.toThrow(MissingTenantContextError);
      expect(transacciones).toBe(0);
    } finally {
      dataSource.transaction = original as typeof dataSource.transaction;
    }
  });

  it('run anidado reutiliza la transacción activa', async () => {
    await expect(
      tenants.run({ tenantId: TENANT_A }, () =>
        uow.run(async () => {
          const externo = uow.manager;
          await uow.run(async () => {
            expect(uow.manager).toBe(externo);
            await uow.manager.query('INSERT INTO uow_prueba VALUES (1)');
          });
          throw new Error('revertir todo');
        }),
      ),
    ).rejects.toThrow('revertir todo');
    expect(await filas()).toBe(0);
  });

  it('manager fuera de run lanza NoActiveTransactionError', () => {
    expect(() => uow.manager).toThrow(NoActiveTransactionError);
  });
});
