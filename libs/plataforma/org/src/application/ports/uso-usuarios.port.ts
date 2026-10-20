import type { ProductoCodigo } from '../../domain/suscripcion.js';

/** Usuarios activos del tenant en un producto, contra los que se valida limite_usuarios (TR-CA-014). */
export interface UsoUsuariosPort {
  activos(tenantId: string, producto: ProductoCodigo): Promise<number>;
}
