import type { ParamMap, Params } from '@angular/router';
import { tamanoPaginaDesdeTexto, tamanoPaginaParaUrl } from '@vitrina/shared/ui';
import { ALCANCES_FERIADO, ANIO_MAXIMO, ANIO_MINIMO, type FiltroFeriados } from '../models/feriado';

/** Query params de la lista de feriados. */
export const PARAMETRO_URL = { anio: 'anio', sucursal: 'sucursal', alcance: 'alcance', pagina: 'pagina', tamano: 'tamano' } as const;

export const PRIMERA_PAGINA = 1;

/** Filtro desde la URL; un año fuera de 2000-2100 o un alcance desconocido se ignoran. */
export function filtroFeriadosDesdeUrl(parametros: ParamMap, anioPorDefecto: number): FiltroFeriados {
  return {
    anio: anioDesdeTexto(parametros.get(PARAMETRO_URL.anio)) ?? anioPorDefecto,
    sucursalId: parametros.get(PARAMETRO_URL.sucursal) || undefined,
    alcance: ALCANCES_FERIADO.find((alcance) => alcance === parametros.get(PARAMETRO_URL.alcance)),
    pagina: paginaDesdeTexto(parametros.get(PARAMETRO_URL.pagina)),
    tamano: tamanoPaginaDesdeTexto(parametros.get(PARAMETRO_URL.tamano)),
  };
}

/** Query params del filtro; el año siempre va, para que sobreviva a recargar. */
export function parametrosUrlFeriados(filtro: FiltroFeriados): Params {
  return {
    [PARAMETRO_URL.anio]: filtro.anio,
    [PARAMETRO_URL.sucursal]: filtro.sucursalId ?? null,
    [PARAMETRO_URL.alcance]: filtro.alcance ?? null,
    [PARAMETRO_URL.pagina]: filtro.pagina > PRIMERA_PAGINA ? filtro.pagina : null,
    [PARAMETRO_URL.tamano]: tamanoPaginaParaUrl(filtro.tamano),
  };
}

/** Valor con que `vit-filtros` precarga sus selects. */
export function valorFiltrosFeriados(filtro: FiltroFeriados): Record<string, string | null> {
  return { [PARAMETRO_URL.sucursal]: filtro.sucursalId ?? null, [PARAMETRO_URL.alcance]: filtro.alcance ?? null };
}

export function anioDentroDeLimites(anio: number): boolean {
  return Number.isInteger(anio) && anio >= ANIO_MINIMO && anio <= ANIO_MAXIMO;
}

function anioDesdeTexto(texto: string | null): number | null {
  const anio = Number(texto);
  return texto !== null && anioDentroDeLimites(anio) ? anio : null;
}

function paginaDesdeTexto(texto: string | null): number {
  const pagina = Number(texto);
  return Number.isInteger(pagina) && pagina >= PRIMERA_PAGINA ? pagina : PRIMERA_PAGINA;
}
