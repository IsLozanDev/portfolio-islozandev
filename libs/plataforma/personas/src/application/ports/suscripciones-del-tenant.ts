import type { ProductoCodigo } from '@vitrina/plataforma/org';

export interface SuscripcionesDelTenant {
  /** PRUEBA o ACTIVA (TR-RN-006). */
  estaVigente(productoCodigo: ProductoCodigo): Promise<boolean>;
}
