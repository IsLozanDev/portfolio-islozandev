export interface TenantScope {
  readonly tenantId: string;
  readonly branchId?: string;
}

export interface TenantContext {
  current(): TenantScope;
  run<T>(scope: TenantScope, fn: () => Promise<T>): Promise<T>;
}
