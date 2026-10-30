import type { ParamMap } from '@angular/router';

/** La API pagina de 20 en 20 por defecto (spec 17a); las listas de organización usan ese tamaño fijo. */
export const TAMANO_PAGINA_ORGANIZACION = 20;
/** Máximo de la API: las opciones de un select (p. ej. la unidad padre) se piden en una sola página. */
export const TAMANO_OPCIONES_ORGANIZACION = 100;
const PRIMERA_PAGINA = 1;

/** Nombres de los query params de las listas de organización. */
export const PARAMETRO_URL_ORGANIZACION = { pagina: 'pagina', empresa: 'empresa', sucursal: 'sucursal', tipo: 'tipo', activo: 'activo' } as const;

/** Página de la URL; un valor que no es un entero ≥ 1 vuelve a la primera. */
export function paginaDesdeUrl(parametros: ParamMap): number {
  const pagina = Number(parametros.get(PARAMETRO_URL_ORGANIZACION.pagina));
  return Number.isInteger(pagina) && pagina >= PRIMERA_PAGINA ? pagina : PRIMERA_PAGINA;
}

/** La primera página queda fuera de la URL. */
export function paginaParaUrl(pagina: number): number | null {
  return pagina > PRIMERA_PAGINA ? pagina : null;
}

/** Filtro de estado de sucursales y unidades: por defecto, solo las activas. */
export const ESTADOS_FILTRO = ['activas', 'inactivas', 'todas'] as const;
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number];
const ESTADO_POR_DEFECTO: EstadoFiltro = 'activas';

/** `?activo=false` → inactivas; `?activo=todas` → todas; sin el parámetro → activas. */
const ESTADO_POR_VALOR_URL: Readonly<Record<string, EstadoFiltro>> = { false: 'inactivas', todas: 'todas' };
const VALOR_URL_POR_ESTADO: Readonly<Record<EstadoFiltro, string | null>> = { activas: null, inactivas: 'false', todas: 'todas' };
const ACTIVO_POR_ESTADO: Readonly<Record<EstadoFiltro, boolean | undefined>> = { activas: true, inactivas: false, todas: undefined };

export function estadoDesdeUrl(parametros: ParamMap): EstadoFiltro {
  return ESTADO_POR_VALOR_URL[parametros.get(PARAMETRO_URL_ORGANIZACION.activo) ?? ''] ?? ESTADO_POR_DEFECTO;
}

export function estadoParaUrl(estado: EstadoFiltro): string | null {
  return VALOR_URL_POR_ESTADO[estado];
}

/** El filtro `activo` de la API; `undefined` trae activas e inactivas. */
export function activoDeEstado(estado: EstadoFiltro): boolean | undefined {
  return ACTIVO_POR_ESTADO[estado];
}
