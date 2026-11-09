import type { ParamMap, Params } from '@angular/router';
import { ESTADOS_ITEM } from '@vitrina/plataforma/catalogos-ui';
import { tamanoPaginaDesdeTexto, tamanoPaginaParaUrl } from '@vitrina/shared/ui';
import { ALCANCES_CATALOGO, ORIGENES_ITEM, type AlcanceCatalogo, type FiltroItemsAdmin } from '../models/catalogo-admin';

export const PRIMERA_PAGINA = 1;

/** Query params de la lista de catálogos y del detalle (spec 19e). */
export const PARAMETRO_URL_CATALOGOS = {
  busqueda: 'q',
  alcance: 'alcance',
  texto: 'texto',
  estado: 'estado',
  origen: 'origen',
  pagina: 'pagina',
  tamano: 'tamano',
} as const;

export interface FiltroCatalogosAdmin {
  q?: string;
  alcance?: AlcanceCatalogo;
  pagina: number;
  tamano: number;
}

export function filtroCatalogosDesdeUrl(parametros: ParamMap): FiltroCatalogosAdmin {
  return {
    q: parametros.get(PARAMETRO_URL_CATALOGOS.busqueda)?.trim() || undefined,
    alcance: delCatalogo(ALCANCES_CATALOGO, parametros.get(PARAMETRO_URL_CATALOGOS.alcance)),
    pagina: paginaDesdeTexto(parametros.get(PARAMETRO_URL_CATALOGOS.pagina)),
    tamano: tamanoPaginaDesdeTexto(parametros.get(PARAMETRO_URL_CATALOGOS.tamano)),
  };
}

export function parametrosUrlCatalogos(filtro: FiltroCatalogosAdmin): Params {
  return {
    [PARAMETRO_URL_CATALOGOS.busqueda]: filtro.q ?? null,
    [PARAMETRO_URL_CATALOGOS.alcance]: filtro.alcance ?? null,
    [PARAMETRO_URL_CATALOGOS.pagina]: paginaParaUrl(filtro.pagina),
    [PARAMETRO_URL_CATALOGOS.tamano]: tamanoPaginaParaUrl(filtro.tamano),
  };
}

export function valorFiltrosCatalogos(filtro: FiltroCatalogosAdmin): Record<string, string | null> {
  return { busqueda: filtro.q ?? '', [PARAMETRO_URL_CATALOGOS.alcance]: filtro.alcance ?? null };
}

export function filtroItemsDesdeUrl(parametros: ParamMap): FiltroItemsAdmin {
  return {
    texto: parametros.get(PARAMETRO_URL_CATALOGOS.texto)?.trim() || undefined,
    estado: delCatalogo(ESTADOS_ITEM, parametros.get(PARAMETRO_URL_CATALOGOS.estado)),
    origen: delCatalogo(ORIGENES_ITEM, parametros.get(PARAMETRO_URL_CATALOGOS.origen)),
    pagina: paginaDesdeTexto(parametros.get(PARAMETRO_URL_CATALOGOS.pagina)),
    tamano: tamanoPaginaDesdeTexto(parametros.get(PARAMETRO_URL_CATALOGOS.tamano)),
  };
}

export function parametrosUrlItems(filtro: FiltroItemsAdmin): Params {
  return {
    [PARAMETRO_URL_CATALOGOS.texto]: filtro.texto ?? null,
    [PARAMETRO_URL_CATALOGOS.estado]: filtro.estado ?? null,
    [PARAMETRO_URL_CATALOGOS.origen]: filtro.origen ?? null,
    [PARAMETRO_URL_CATALOGOS.pagina]: paginaParaUrl(filtro.pagina),
    [PARAMETRO_URL_CATALOGOS.tamano]: tamanoPaginaParaUrl(filtro.tamano),
  };
}

export function valorFiltrosItems(filtro: FiltroItemsAdmin): Record<string, string | null> {
  return {
    busqueda: filtro.texto ?? '',
    [PARAMETRO_URL_CATALOGOS.estado]: filtro.estado ?? null,
    [PARAMETRO_URL_CATALOGOS.origen]: filtro.origen ?? null,
  };
}

function delCatalogo<Valor extends string>(catalogo: readonly Valor[], valor: string | null): Valor | undefined {
  return catalogo.find((permitido) => permitido === valor);
}

function paginaDesdeTexto(texto: string | null): number {
  const pagina = Number(texto);
  return Number.isInteger(pagina) && pagina >= PRIMERA_PAGINA ? pagina : PRIMERA_PAGINA;
}

function paginaParaUrl(pagina: number): number | null {
  return pagina > PRIMERA_PAGINA ? pagina : null;
}
