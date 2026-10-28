/** Campos de las listas de `/v1/org` (spec 17a) que usa el selector de alcance. */
export interface EmpresaRespuesta {
  id: string;
  razon_social: string;
}

export interface SucursalRespuesta {
  id: string;
  codigo: string;
  nombre: string;
}

export interface UnidadRespuesta {
  id: string;
  codigo: string;
  nombre: string;
}

export interface Ubicacion {
  id: string;
  nombre: string;
}

export const aEmpresa = (respuesta: EmpresaRespuesta): Ubicacion => ({ id: respuesta.id, nombre: respuesta.razon_social });
export const aSucursal = (respuesta: SucursalRespuesta): Ubicacion => ({ id: respuesta.id, nombre: respuesta.nombre });
/** El código va delante: en una sucursal hay varias cajas con nombres parecidos (TR-CA-036). */
export const aUnidad = (respuesta: UnidadRespuesta): Ubicacion => ({ id: respuesta.id, nombre: `${respuesta.codigo} · ${respuesta.nombre}` });
