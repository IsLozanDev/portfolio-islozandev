/** Fila de `GET /v1/seg/perfiles` tal cual (spec 16c). */
export interface PerfilRespuesta {
  id: string;
  codigo: string;
  nombre: string;
  predefinido: boolean;
  total_roles: number;
  productos: string[];
}

export interface ListadoPerfilesRespuesta {
  items: PerfilRespuesta[];
}

/** `GET /v1/seg/perfiles/:perfilId` tal cual. */
export interface PerfilDetalleRespuesta {
  id: string;
  codigo: string;
  nombre: string;
  predefinido: boolean;
  roles: string[];
}

/** Fila de `GET /v1/seg/perfiles/roles-disponibles` tal cual. */
export interface RolDisponibleRespuesta {
  id: string;
  codigo: string;
  nombre: string;
  producto_codigo: string;
  producto_nombre: string;
  predefinido: boolean;
}

export interface ListadoRolesDisponiblesRespuesta {
  items: RolDisponibleRespuesta[];
}

export interface PerfilCreadoRespuesta {
  perfil_id: string;
}

export interface Perfil {
  id: string;
  codigo: string;
  nombre: string;
  /** No se editan sus roles, se copia. */
  predefinido: boolean;
  totalRoles: number;
  productos: string[];
}

export interface PerfilDetalle {
  id: string;
  codigo: string;
  nombre: string;
  predefinido: boolean;
  /** Ids de sus roles. */
  roles: string[];
}

/** Rol activo de PLAT o de un producto contratado que se puede poner en un perfil (TR-CA-035). */
export interface RolDisponible {
  id: string;
  codigo: string;
  nombre: string;
  productoCodigo: string;
  productoNombre: string;
  predefinido: boolean;
}

/** Lo que se escribe en `form-codigo-nombre`; los roles salen del selector. */
export interface FormularioPerfil {
  codigo: string;
  nombre: string;
}

export function aPerfil(respuesta: PerfilRespuesta): Perfil {
  return {
    id: respuesta.id,
    codigo: respuesta.codigo,
    nombre: respuesta.nombre,
    predefinido: respuesta.predefinido,
    totalRoles: respuesta.total_roles,
    productos: respuesta.productos,
  };
}

export function aPerfilDetalle(respuesta: PerfilDetalleRespuesta): PerfilDetalle {
  return { id: respuesta.id, codigo: respuesta.codigo, nombre: respuesta.nombre, predefinido: respuesta.predefinido, roles: respuesta.roles };
}

export function aRolDisponible(respuesta: RolDisponibleRespuesta): RolDisponible {
  return {
    id: respuesta.id,
    codigo: respuesta.codigo,
    nombre: respuesta.nombre,
    productoCodigo: respuesta.producto_codigo,
    productoNombre: respuesta.producto_nombre,
    predefinido: respuesta.predefinido,
  };
}
