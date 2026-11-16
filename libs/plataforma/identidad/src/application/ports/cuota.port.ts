export const CUOTA_PORT = Symbol('CuotaPort');

/** Cuota mensual de consultas al proveedor por tenant. El adaptador real llega con el spec 29. */
export interface CuotaPort {
  /** false si el tenant agotó su cuota. */
  reservar(tenantId: string): Promise<boolean>;
  liberar(tenantId: string): Promise<void>;
}
