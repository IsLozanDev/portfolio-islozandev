/** Fila de `GET /v1/seg/roles` tal cual (spec 16b). */
export interface RolRespuesta {
  id: string;
  codigo: string;
  nombre: string;
  producto_codigo: string;
  producto_nombre: string;
  predefinido: boolean;
  activo: boolean;
  total_permisos: number;
}

export interface ListadoRolesRespuesta {
  items: RolRespuesta[];
}

/** `GET /v1/seg/roles/:rolId` tal cual. */
export interface RolDetalleRespuesta extends Omit<RolRespuesta, 'total_permisos'> {
  permisos: string[];
}

export interface RolCreadoRespuesta {
  rol_id: string;
}

export interface ResultadoInactivarRespuesta {
  requiere_confirmacion: boolean;
  afectados: number;
}

export interface Rol {
  id: string;
  codigo: string;
  nombre: string;
  productoCodigo: string;
  productoNombre: string;
  /** Del manifiesto: no se edita, se copia (TR-CA-032). */
  predefinido: boolean;
  activo: boolean;
  totalPermisos: number;
}

export interface RolDetalle extends Omit<Rol, 'totalPermisos'> {
  permisos: string[];
}

export interface ResultadoInactivar {
  requiereConfirmacion: boolean;
  /** Usuarios con una asignación vigente al rol (TR-CA-033). */
  afectados: number;
}

/** Lo que se escribe en `form-rol`; los permisos salen del árbol. */
export interface FormularioRol {
  codigo: string;
  nombre: string;
}

export function aRol(respuesta: RolRespuesta): Rol {
  return {
    id: respuesta.id,
    codigo: respuesta.codigo,
    nombre: respuesta.nombre,
    productoCodigo: respuesta.producto_codigo,
    productoNombre: respuesta.producto_nombre,
    predefinido: respuesta.predefinido,
    activo: respuesta.activo,
    totalPermisos: respuesta.total_permisos,
  };
}

export function aRolDetalle(respuesta: RolDetalleRespuesta): RolDetalle {
  return {
    id: respuesta.id,
    codigo: respuesta.codigo,
    nombre: respuesta.nombre,
    productoCodigo: respuesta.producto_codigo,
    productoNombre: respuesta.producto_nombre,
    predefinido: respuesta.predefinido,
    activo: respuesta.activo,
    permisos: respuesta.permisos,
  };
}

export function aResultadoInactivar(respuesta: ResultadoInactivarRespuesta): ResultadoInactivar {
  return { requiereConfirmacion: respuesta.requiere_confirmacion, afectados: respuesta.afectados };
}
