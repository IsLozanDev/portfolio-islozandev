import type { PaginaOrganizacion } from './empresa';

/** Fila de `GET /v1/org/empresas/:id/sucursales` y de `GET /v1/org/sucursales/:id` tal cual (spec 17a y 17c). */
export interface FilaSucursalRespuesta {
  id: string;
  empresa_id: string;
  codigo: string;
  nombre: string;
  codigo_establecimiento_sunat: string | null;
  direccion: string | null;
  ubigeo: string | null;
  telefono: string | null;
  zona_horaria: string;
  es_principal: boolean;
  activo: boolean;
  version: number;
}

export interface SucursalRegistradaRespuesta {
  sucursal_id: string;
}

export interface Sucursal {
  id: string;
  empresaId: string;
  codigo: string;
  nombre: string;
  codigoEstablecimientoSunat: string | null;
  direccion: string | null;
  ubigeo: string | null;
  telefono: string | null;
  zonaHoraria: string;
  /** Una sola por empresa, con el establecimiento 0000 (TR-RN-003). */
  esPrincipal: boolean;
  activo: boolean;
  version: number;
}

export interface DatosSucursal {
  codigo: string;
  nombre: string;
  codigoEstablecimientoSunat: string | null;
  direccion: string | null;
  ubigeo: string | null;
  telefono: string | null;
  zonaHoraria: string;
}

export interface FiltroSucursales extends PaginaOrganizacion {
  activo?: boolean;
}

export function filaASucursal(respuesta: FilaSucursalRespuesta): Sucursal {
  return {
    id: respuesta.id,
    empresaId: respuesta.empresa_id,
    codigo: respuesta.codigo,
    nombre: respuesta.nombre,
    codigoEstablecimientoSunat: respuesta.codigo_establecimiento_sunat,
    direccion: respuesta.direccion,
    ubigeo: respuesta.ubigeo,
    telefono: respuesta.telefono,
    zonaHoraria: respuesta.zona_horaria,
    esPrincipal: respuesta.es_principal,
    activo: respuesta.activo,
    version: respuesta.version,
  };
}

export function datosDeSucursal(sucursal: Sucursal): DatosSucursal {
  return {
    codigo: sucursal.codigo,
    nombre: sucursal.nombre,
    codigoEstablecimientoSunat: sucursal.codigoEstablecimientoSunat,
    direccion: sucursal.direccion,
    ubigeo: sucursal.ubigeo,
    telefono: sucursal.telefono,
    zonaHoraria: sucursal.zonaHoraria,
  };
}

export function cuerpoDatosSucursal(datos: DatosSucursal) {
  return {
    codigo: datos.codigo,
    nombre: datos.nombre,
    codigo_establecimiento_sunat: datos.codigoEstablecimientoSunat,
    direccion: datos.direccion,
    ubigeo: datos.ubigeo,
    telefono: datos.telefono,
    zona_horaria: datos.zonaHoraria,
  };
}
