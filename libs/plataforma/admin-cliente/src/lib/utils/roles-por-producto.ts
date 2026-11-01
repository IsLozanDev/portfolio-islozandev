import type { RolDisponible } from '../models/perfil';

export interface RolesDeProducto {
  productoCodigo: string;
  productoNombre: string;
  roles: RolDisponible[];
}

/** Un grupo por producto, en el orden en que llegan los roles de la API (producto y nombre). */
export function agruparRolesPorProducto(roles: readonly RolDisponible[]): RolesDeProducto[] {
  const grupos = new Map<string, RolesDeProducto>();
  for (const rol of roles) {
    const grupo = grupos.get(rol.productoCodigo) ?? { productoCodigo: rol.productoCodigo, productoNombre: rol.productoNombre, roles: [] };
    grupo.roles.push(rol);
    grupos.set(rol.productoCodigo, grupo);
  }
  return [...grupos.values()];
}
