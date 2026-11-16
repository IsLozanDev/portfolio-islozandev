import type { Params, ParamMap } from '@angular/router';
import { periodoActual, periodosSeleccionables } from './periodo';

/** Query params de la lista de cuotas. */
export const PARAMETRO_URL = { periodo: 'periodo', busqueda: 'q', pagina: 'pagina' } as const;

export const PRIMERA_PAGINA = 1;

export interface FiltroCuotas {
  periodo: string;
  q?: string;
  pagina: number;
}

/** Filtro desde la URL. Sin `periodo` o con uno fuera de los seleccionables, el mes actual. */
export function filtroCuotasDesdeUrl(parametros: ParamMap, ahora: Date): FiltroCuotas {
  const periodo = parametros.get(PARAMETRO_URL.periodo);
  const esSeleccionable = periodo !== null && periodosSeleccionables(ahora).includes(periodo);
  return {
    periodo: esSeleccionable ? periodo : periodoActual(ahora),
    q: parametros.get(PARAMETRO_URL.busqueda)?.trim() || undefined,
    pagina: paginaDesdeTexto(parametros.get(PARAMETRO_URL.pagina)),
  };
}

/** Query params del filtro; la búsqueda vacía y la primera página quedan fuera de la URL. */
export function parametrosUrlCuotas(filtro: FiltroCuotas): Params {
  return {
    [PARAMETRO_URL.periodo]: filtro.periodo,
    [PARAMETRO_URL.busqueda]: filtro.q ?? null,
    [PARAMETRO_URL.pagina]: paginaParaUrl(filtro.pagina),
  };
}

/** Valor con que `vit-filtros` precarga la búsqueda. */
export function valorFiltrosCuotas(filtro: FiltroCuotas): Record<string, string | null> {
  return { busqueda: filtro.q ?? '' };
}

export function paginaDesdeTexto(texto: string | null): number {
  const pagina = Number(texto);
  return Number.isInteger(pagina) && pagina >= PRIMERA_PAGINA ? pagina : PRIMERA_PAGINA;
}

export function paginaParaUrl(pagina: number): number | null {
  return pagina > PRIMERA_PAGINA ? pagina : null;
}
