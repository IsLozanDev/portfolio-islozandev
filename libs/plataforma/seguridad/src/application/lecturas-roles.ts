import { NotFoundError, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { armarArbolPermisos, type ArbolPermisos } from './arbol-permisos.js';
import type { LecturaRoles, Producto, RolDetalle, RolListado } from './ports/lectura-roles.js';
import type { CatalogoPermisos, ProductosContratados } from './ports/repositorios.js';
import { exigirContratado, permisosPlatDelCliente, PRODUCTO_PLATAFORMA, productosDelCliente } from './productos-del-cliente.js';

export interface DependenciasLecturaRoles {
  unidadDeTrabajo: UnitOfWork;
  lectura: LecturaRoles;
  productos: ProductosContratados;
  catalogo: Pick<CatalogoPermisos, 'permisosDeRolPredefinido'>;
}

/** Roles de PLAT y de los productos contratados; sin los predefinidos PLAT que pasan el techo del cliente. */
export class ListarRoles {
  constructor(private readonly dependencias: DependenciasLecturaRoles) {}

  ejecutar(): Promise<RolListado[]> {
    const { unidadDeTrabajo, lectura, productos, catalogo } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const roles = await lectura.listar(await productosDelCliente(productos));
      const permitidos = await permisosPlatDelCliente(catalogo);
      const visibles: RolListado[] = [];
      // En serie: comparten la conexión de la transacción.
      for (const rol of roles) {
        if (await this.excedeElTecho(rol, permitidos)) continue;
        visibles.push(rol);
      }
      return visibles;
    });
  }

  private async excedeElTecho(rol: RolListado, permitidos: ReadonlySet<string>): Promise<boolean> {
    if (!rol.predefinido || rol.productoCodigo !== PRODUCTO_PLATAFORMA) return false;
    const detalle = await this.dependencias.lectura.detalle(rol.id);
    return detalle !== null && detalle.permisos.some((permiso) => !permitidos.has(permiso));
  }
}

export class ConsultarRol {
  constructor(private readonly dependencias: Pick<DependenciasLecturaRoles, 'unidadDeTrabajo' | 'lectura'>) {}

  /** Un rol de otro tenant no se ve: responde que no existe (404, no 403). */
  ejecutar(rolId: string): Promise<RolDetalle> {
    const { unidadDeTrabajo, lectura } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const detalle = await lectura.detalle(rolId);
      if (!detalle) throw new NotFoundError('El rol no existe');
      return detalle;
    });
  }
}

/** Árbol de permisos del editor; un producto sin suscripción vigente se rechaza (TR-RN-006). */
export class ConsultarCatalogo {
  constructor(private readonly dependencias: DependenciasLecturaRoles) {}

  ejecutar(productoCodigo: string): Promise<ArbolPermisos> {
    const { unidadDeTrabajo, lectura, productos, catalogo } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      await exigirContratado(productos, productoCodigo);
      const filas = await lectura.catalogo(productoCodigo);
      if (productoCodigo !== PRODUCTO_PLATAFORMA) return armarArbolPermisos(productoCodigo, filas);
      const permitidos = await permisosPlatDelCliente(catalogo);
      return armarArbolPermisos(
        productoCodigo,
        filas.filter((fila) => permitidos.has(fila.permiso.codigo)),
      );
    });
  }
}

/** Productos en los que el cliente puede crear roles: PLAT y los contratados. */
export class ListarProductosDisponibles {
  constructor(private readonly dependencias: Pick<DependenciasLecturaRoles, 'unidadDeTrabajo' | 'lectura' | 'productos'>) {}

  ejecutar(): Promise<Producto[]> {
    const { unidadDeTrabajo, lectura, productos } = this.dependencias;
    return unidadDeTrabajo.run(async () => lectura.productos(await productosDelCliente(productos)));
  }
}
