import type { Alcance } from './asignacion';

/** Permiso de `GET /v1/seg/catalogo/:productoCodigo` tal cual (spec 16b). */
export interface PermisoDelArbolRespuesta {
  codigo: string;
  descripcion: string;
  sensible: boolean;
  alcance_minimo: Alcance;
}

export interface ArbolPermisosRespuesta {
  producto_codigo: string;
  modulos: { codigo: string; nombre: string; opciones: { codigo: string; nombre: string; permisos: PermisoDelArbolRespuesta[] }[] }[];
  otros: PermisoDelArbolRespuesta[];
}

export interface ProductosDisponiblesRespuesta {
  items: ProductoDisponible[];
}

/** PLAT o un producto con suscripción vigente. */
export interface ProductoDisponible {
  codigo: string;
  nombre: string;
}

export interface PermisoDelArbol {
  codigo: string;
  descripcion: string;
  /** Asignar un rol con él exige MFA reciente (TR-RN-009). */
  sensible: boolean;
  alcanceMinimo: Alcance;
}

export interface OpcionDelArbol {
  codigo: string;
  nombre: string;
  permisos: PermisoDelArbol[];
}

export interface ModuloDelArbol {
  codigo: string;
  nombre: string;
  opciones: OpcionDelArbol[];
}

/** Módulo → opción → permiso; cada permiso aparece una sola vez. `otros`: permisos sin opción de menú. */
export interface ArbolPermisos {
  productoCodigo: string;
  modulos: ModuloDelArbol[];
  otros: PermisoDelArbol[];
}

function aPermisoDelArbol(respuesta: PermisoDelArbolRespuesta): PermisoDelArbol {
  return { codigo: respuesta.codigo, descripcion: respuesta.descripcion, sensible: respuesta.sensible, alcanceMinimo: respuesta.alcance_minimo };
}

export function aArbolPermisos(respuesta: ArbolPermisosRespuesta): ArbolPermisos {
  return {
    productoCodigo: respuesta.producto_codigo,
    modulos: respuesta.modulos.map((modulo) => ({
      codigo: modulo.codigo,
      nombre: modulo.nombre,
      opciones: modulo.opciones.map((opcion) => ({ codigo: opcion.codigo, nombre: opcion.nombre, permisos: opcion.permisos.map(aPermisoDelArbol) })),
    })),
    otros: respuesta.otros.map(aPermisoDelArbol),
  };
}
