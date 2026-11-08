import type { Params, ParamMap } from '@angular/router';
import { ESTADOS_ITEM } from '@vitrina/plataforma/catalogos-ui';
import { tamanoPaginaDesdeTexto, tamanoPaginaParaUrl } from '@vitrina/shared/ui';
import { ALCANCES_CATALOGO, type AlcanceCatalogo } from '../models/catalogo';
import type { FiltroItems } from '../models/fila-item';

/** Query params de la lista de catálogos. */
export const PARAMETRO_URL = { busqueda: 'q', alcance: 'alcance', pagina: 'pagina', tamano: 'tamano' } as const;

export const PRIMERA_PAGINA = 1;

export interface FiltroCatalogos {
  q?: string;
  alcance?: AlcanceCatalogo;
  pagina: number;
  tamano: number;
}

/** Filtro de la lista desde la URL. Un valor que no es del catálogo se ignora. */
export function filtroCatalogosDesdeUrl(parametros: ParamMap): FiltroCatalogos {
  return {
    q: parametros.get(PARAMETRO_URL.busqueda)?.trim() || undefined,
    alcance: delCatalogo(ALCANCES_CATALOGO, parametros.get(PARAMETRO_URL.alcance)),
    pagina: paginaDesdeTexto(parametros.get(PARAMETRO_URL.pagina)),
    tamano: tamanoPaginaDesdeTexto(parametros.get(PARAMETRO_URL.tamano)),
  };
}

/** Query params del filtro; los vacíos, la primera página y el tamaño por defecto quedan fuera de la URL. */
export function parametrosUrlCatalogos(filtro: FiltroCatalogos): Params {
  return {
    [PARAMETRO_URL.busqueda]: filtro.q ?? null,
    [PARAMETRO_URL.alcance]: filtro.alcance ?? null,
    [PARAMETRO_URL.pagina]: paginaParaUrl(filtro.pagina),
    [PARAMETRO_URL.tamano]: tamanoPaginaParaUrl(filtro.tamano),
  };
}

/** Valor con que `vit-filtros` precarga sus controles. */
export function valorFiltrosCatalogos(filtro: FiltroCatalogos): Record<string, string | null> {
  return { busqueda: filtro.q ?? '', [PARAMETRO_URL.alcance]: filtro.alcance ?? null };
}

export function paginaDesdeTexto(texto: string | null): number {
  const pagina = Number(texto);
  return Number.isInteger(pagina) && pagina >= PRIMERA_PAGINA ? pagina : PRIMERA_PAGINA;
}

export function paginaParaUrl(pagina: number): number | null {
  return pagina > PRIMERA_PAGINA ? pagina : null;
}

export function delCatalogo<Valor extends string>(catalogo: readonly Valor[], valor: string | null): Valor | undefined {
  return catalogo.find((permitido) => permitido === valor);
}

/** Query params del detalle de un catálogo: la pestaña y el filtro de la pestaña «Ítems». */
export const PARAMETRO_URL_DETALLE = { pestana: 'pestana', texto: 'texto', estado: 'estado', pagina: 'pagina', tamano: 'tamano' } as const;

export const PESTANAS_DETALLE = ['items', 'importaciones'] as const;
export type PestanaDetalle = (typeof PESTANAS_DETALLE)[number];
export const PESTANA_POR_DEFECTO: PestanaDetalle = 'items';

export function pestanaDesdeUrl(parametros: ParamMap): PestanaDetalle {
  return delCatalogo(PESTANAS_DETALLE, parametros.get(PARAMETRO_URL_DETALLE.pestana)) ?? PESTANA_POR_DEFECTO;
}

export function filtroItemsDesdeUrl(parametros: ParamMap): FiltroItems {
  return {
    texto: parametros.get(PARAMETRO_URL_DETALLE.texto)?.trim() || undefined,
    estado: delCatalogo(ESTADOS_ITEM, parametros.get(PARAMETRO_URL_DETALLE.estado)),
    pagina: paginaDesdeTexto(parametros.get(PARAMETRO_URL_DETALLE.pagina)),
    tamano: tamanoPaginaDesdeTexto(parametros.get(PARAMETRO_URL_DETALLE.tamano)),
  };
}

/** Sin la pestaña: se navega con `queryParamsHandling: 'merge'`. */
export function parametrosUrlItems(filtro: FiltroItems): Params {
  return {
    [PARAMETRO_URL_DETALLE.texto]: filtro.texto ?? null,
    [PARAMETRO_URL_DETALLE.estado]: filtro.estado ?? null,
    [PARAMETRO_URL_DETALLE.pagina]: paginaParaUrl(filtro.pagina),
    [PARAMETRO_URL_DETALLE.tamano]: tamanoPaginaParaUrl(filtro.tamano),
  };
}

export function valorFiltrosItems(filtro: FiltroItems): Record<string, string | null> {
  return { busqueda: filtro.texto ?? '', [PARAMETRO_URL_DETALLE.estado]: filtro.estado ?? null };
}
