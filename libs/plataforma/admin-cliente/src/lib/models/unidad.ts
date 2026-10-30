import type { PaginaOrganizacion } from './empresa';
import type { TipoUnidad } from './tipos-unidad';

/** Fila de `GET /v1/org/unidades` y de `GET /v1/org/unidades/:id` tal cual (spec 17a y 17c). */
export interface FilaUnidadRespuesta {
  id: string;
  empresa_id: string;
  sucursal_id: string | null;
  tipo: TipoUnidad;
  codigo: string;
  nombre: string;
  padre_id: string | null;
  atributos: Record<string, unknown>;
  activo: boolean;
  version: number;
}

export interface UnidadRegistradaRespuesta {
  unidad_id: string;
}

/** Los tres atributos que edita la UI; sin esquema por tipo hasta el 19a. */
export interface AtributosUnidad {
  impresora?: string;
  capacidad?: number;
  piso?: string;
}

export interface Unidad {
  id: string;
  empresaId: string;
  /** null: unidad de nivel empresa (solo almacenes, TR-CA-012). */
  sucursalId: string | null;
  tipo: TipoUnidad;
  codigo: string;
  nombre: string;
  padreId: string | null;
  atributos: Record<string, unknown>;
  activo: boolean;
  version: number;
}

/** Lo que se edita de una unidad: tipo, empresa y sucursal solo se eligen en el alta. */
export interface DatosUnidad {
  codigo: string;
  nombre: string;
  padreId: string | null;
  atributos: Record<string, unknown>;
}

export interface AltaUnidad extends DatosUnidad {
  empresaId: string;
  sucursalId: string | null;
  tipo: TipoUnidad;
}

export interface FiltroUnidades extends PaginaOrganizacion {
  empresaId: string;
  sucursalId?: string;
  tipo?: TipoUnidad;
  activo?: boolean;
}

export function filaAUnidad(respuesta: FilaUnidadRespuesta): Unidad {
  return {
    id: respuesta.id,
    empresaId: respuesta.empresa_id,
    sucursalId: respuesta.sucursal_id,
    tipo: respuesta.tipo,
    codigo: respuesta.codigo,
    nombre: respuesta.nombre,
    padreId: respuesta.padre_id,
    atributos: respuesta.atributos,
    activo: respuesta.activo,
    version: respuesta.version,
  };
}

export function datosDeUnidad(unidad: Unidad): DatosUnidad {
  return { codigo: unidad.codigo, nombre: unidad.nombre, padreId: unidad.padreId, atributos: unidad.atributos };
}

export function cuerpoDatosUnidad(datos: DatosUnidad) {
  return { codigo: datos.codigo, nombre: datos.nombre, padre_id: datos.padreId, atributos: datos.atributos };
}
