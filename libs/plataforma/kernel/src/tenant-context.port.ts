export interface TenantScope {
  readonly tenantId: string;
  readonly branchId?: string;
  /** Usuario del token. Sin actor, la operación es del sistema (tareas del worker, CLI). */
  readonly actorId?: string;
  readonly ip?: string;
  /** 32 hex del `traceparent` W3C de la petición. */
  readonly traceId?: string;
}

export interface TenantContext {
  current(): TenantScope;
  run<T>(scope: TenantScope, fn: () => Promise<T>): Promise<T>;
}
