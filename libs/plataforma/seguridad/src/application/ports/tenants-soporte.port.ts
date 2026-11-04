/** Código de un tenant, leído con la RLS del tenant del contexto: solo responde por ese mismo tenant. */
export interface TenantsSoporte {
  codigoDel(tenantId: string): Promise<string | null>;
}
