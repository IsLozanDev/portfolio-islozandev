export const ALCANCES_FERIADO = ['GLOBAL', 'TENANT', 'SUCURSAL'] as const;
export type AlcanceFeriado = (typeof ALCANCES_FERIADO)[number];

/** Los mismos límites del back (19c). */
export const ANIO_MINIMO = 2000;
export const ANIO_MAXIMO = 2100;

/** Un feriado en la lista de un año: `fechaEnAnio` es la fecha en ese año (los recurrentes, proyectados). */
export interface FeriadoDelAnio {
  id: string;
  alcance: AlcanceFeriado;
  sucursalId: string | null;
  fecha: string;
  fechaEnAnio: string;
  nombre: string;
  recurrenteAnual: boolean;
  version: number;
  editable: boolean;
}

export interface FiltroFeriados {
  anio: number;
  sucursalId?: string;
  alcance?: AlcanceFeriado;
  pagina: number;
  tamano: number;
}

export interface PaginaFeriados {
  items: FeriadoDelAnio[];
  total: number;
}

export interface SolicitudFeriado {
  alcance: AlcanceFeriado;
  sucursalId: string | null;
  fecha: string;
  nombre: string;
  recurrenteAnual: boolean;
}

/** Una sucursal accesible de `mi-contexto`, para el filtro, la columna y el select del panel. */
export interface SucursalFeriado {
  id: string;
  nombre: string;
}

/** Al editar, el alcance y la sucursal no cambian (19c). */
export type CambiosFeriado = Pick<SolicitudFeriado, 'fecha' | 'nombre' | 'recurrenteAnual'>;

/** `FeriadoDelAnioDto` de `GET /v1/feriados`. */
export interface FeriadoDelAnioRespuesta {
  id: string;
  alcance: AlcanceFeriado;
  sucursal_id: string | null;
  fecha: string;
  fecha_en_anio: string;
  nombre: string;
  recurrente_anual: boolean;
  version: number;
  editable: boolean;
}

export interface PaginaFeriadosRespuesta {
  items: FeriadoDelAnioRespuesta[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface FeriadoActualizadoRespuesta {
  cambiado: boolean;
}

export interface CuerpoCrearFeriado {
  alcance: AlcanceFeriado;
  sucursal_id: string | null;
  fecha: string;
  nombre: string;
  recurrente_anual: boolean;
}

export interface CuerpoActualizarFeriado {
  fecha: string;
  nombre: string;
  recurrente_anual: boolean;
  version: number;
}

export function aFeriadoDelAnio(respuesta: FeriadoDelAnioRespuesta): FeriadoDelAnio {
  return {
    id: respuesta.id,
    alcance: respuesta.alcance,
    sucursalId: respuesta.sucursal_id,
    fecha: respuesta.fecha,
    fechaEnAnio: respuesta.fecha_en_anio,
    nombre: respuesta.nombre,
    recurrenteAnual: respuesta.recurrente_anual,
    version: respuesta.version,
    editable: respuesta.editable,
  };
}

export function aPaginaFeriados(respuesta: PaginaFeriadosRespuesta): PaginaFeriados {
  return { items: respuesta.items.map(aFeriadoDelAnio), total: respuesta.total };
}

export function aCuerpoCrearFeriado(solicitud: SolicitudFeriado): CuerpoCrearFeriado {
  return {
    alcance: solicitud.alcance,
    sucursal_id: solicitud.sucursalId,
    fecha: solicitud.fecha,
    nombre: solicitud.nombre,
    recurrente_anual: solicitud.recurrenteAnual,
  };
}

export function aCuerpoActualizarFeriado(cambios: CambiosFeriado, version: number): CuerpoActualizarFeriado {
  return { fecha: cambios.fecha, nombre: cambios.nombre, recurrente_anual: cambios.recurrenteAnual, version };
}

/** Query params de `GET /v1/feriados`; los filtros vacíos no viajan. */
export function parametrosConsultaFeriados(filtro: FiltroFeriados): Record<string, string | number> {
  return {
    anio: filtro.anio,
    ...(filtro.sucursalId ? { sucursal_id: filtro.sucursalId } : {}),
    ...(filtro.alcance ? { alcance: filtro.alcance } : {}),
    pagina: filtro.pagina,
    tamano: filtro.tamano,
  };
}
