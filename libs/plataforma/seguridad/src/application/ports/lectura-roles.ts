import type { Alcance } from '../../domain/alcance.js';

export interface RolListado {
  id: string;
  codigo: string;
  nombre: string;
  productoCodigo: string;
  productoNombre: string;
  predefinido: boolean;
  /** Activo y no obsoleto. */
  activo: boolean;
  totalPermisos: number;
}

export interface RolDetalle extends Omit<RolListado, 'totalPermisos'> {
  /** Ordenados por código. */
  permisos: string[];
}

export interface PermisoDelCatalogo {
  codigo: string;
  descripcion: string;
  sensible: boolean;
  alcanceMinimo: Alcance;
}

export interface ElementoDelMenu {
  codigo: string;
  nombre: string;
  orden: number;
}

/** Una fila por par permiso-opción; un permiso sin opción vigente viene con `modulo` y `opcion` en null. */
export interface FilaCatalogo {
  permiso: PermisoDelCatalogo;
  modulo: ElementoDelMenu | null;
  opcion: ElementoDelMenu | null;
}

export interface Producto {
  codigo: string;
  nombre: string;
}

/** Roles visibles para el tenant del contexto (propios y predefinidos) y catálogo global de permisos. */
export interface LecturaRoles {
  /** Propios del tenant (activos e inactivos) y predefinidos activos de esos productos, por producto y nombre. */
  listar(productos: readonly string[]): Promise<RolListado[]>;
  /** Propio del tenant o predefinido; null si no existe o es de otro tenant. */
  detalle(rolId: string): Promise<RolDetalle | null>;
  /** Permisos no obsoletos del producto con sus opciones y módulos no obsoletos. */
  catalogo(productoCodigo: string): Promise<FilaCatalogo[]>;
  /** Los productos con esos códigos, por código. */
  productos(codigos: readonly string[]): Promise<Producto[]>;
}
