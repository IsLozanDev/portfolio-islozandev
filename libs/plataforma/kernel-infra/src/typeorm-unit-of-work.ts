import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataSource, EntityManager } from 'typeorm';
import { NoActiveTransactionError, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';

export class TypeOrmUnitOfWork implements UnitOfWork {
  private readonly storage = new AsyncLocalStorage<EntityManager>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContext,
  ) {}

  get manager(): EntityManager {
    const manager = this.storage.getStore();
    if (!manager) throw new NoActiveTransactionError();
    return manager;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.storage.getStore()) return work();

    const { tenantId } = this.tenantContext.current();
    return this.dataSource.transaction(async (manager) => {
      // is_local = true equivale a SET LOCAL: el valor muere con la transacción y no queda en la conexión del pool.
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      return this.storage.run(manager, work);
    });
  }
}
