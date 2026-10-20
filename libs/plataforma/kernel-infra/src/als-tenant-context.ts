import { AsyncLocalStorage } from 'node:async_hooks';
import { MissingTenantContextError, type TenantContext, type TenantScope } from '@vitrina/plataforma/kernel';

export class AlsTenantContext implements TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantScope>();

  current(): TenantScope {
    const scope = this.storage.getStore();
    if (!scope) throw new MissingTenantContextError();
    return scope;
  }

  run<T>(scope: TenantScope, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(scope, fn);
  }
}
