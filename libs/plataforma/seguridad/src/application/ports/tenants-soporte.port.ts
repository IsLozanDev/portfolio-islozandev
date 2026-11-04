export interface TenantsSoporte {
  /** Código del tenant, leído con la RLS del tenant del contexto: solo responde por ese mismo tenant. */
  codigoDel(tenantId: string): Promise<string | null>;
  /** Id del tenant con ese código, sin tenant en contexto (org.tenant_por_codigo, spec 12). */
  idDelCodigo(codigo: string): Promise<string | null>;
}
