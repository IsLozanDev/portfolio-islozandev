import { ProductoNoContratadoError, RolFueraDelTechoError } from '../domain/errores.js';
import type { Rol } from '../domain/rol.js';
import { ROL_PROPIETARIO } from './invitar-propietario.js';
import type { CatalogoPermisos, ProductosContratados } from './ports/repositorios.js';

/** PLAT no se contrata: sus roles existen en todo tenant. */
export const PRODUCTO_PLATAFORMA = 'PLAT';

/** Precondición de TR-RF-011: suscripción vigente al producto del rol. */
export async function exigirContratado(productos: ProductosContratados, productoCodigo: string): Promise<void> {
  if (productoCodigo !== PRODUCTO_PLATAFORMA && !(await productos.vigentes()).includes(productoCodigo)) {
    throw new ProductoNoContratadoError(productoCodigo);
  }
}

/** PLAT y los productos con suscripción vigente: los que el cliente ve en roles y catálogo (TR-RN-006). */
export async function productosDelCliente(productos: ProductosContratados): Promise<string[]> {
  return [PRODUCTO_PLATAFORMA, ...(await productos.vigentes())];
}

/**
 * Techo de un rol PLAT del cliente: los permisos de PLAT_PROPIETARIO. Quedan fuera los de operador
 * y de despliegue (`plat.tenant.*`, `plat.manifiesto.aplicar`), spec 16b.
 */
export async function permisosPlatDelCliente(catalogo: Pick<CatalogoPermisos, 'permisosDeRolPredefinido'>): Promise<ReadonlySet<string>> {
  return new Set(await catalogo.permisosDeRolPredefinido(ROL_PROPIETARIO));
}

/** Lanza RolFueraDelTechoError si un rol PLAT (predefinido o propio) tiene un permiso fuera de PLAT_PROPIETARIO. */
export function exigirRolesDentroDelTecho(roles: readonly Rol[], permitidos: ReadonlySet<string>): void {
  const fueraDelTecho = roles.find(
    (rol) => rol.productoCodigo === PRODUCTO_PLATAFORMA && rol.permisos.some((permiso) => !permitidos.has(permiso)),
  );
  if (fueraDelTecho) throw new RolFueraDelTechoError(fueraDelTecho.datos.codigo);
}
