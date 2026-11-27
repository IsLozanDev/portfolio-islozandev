import type { ParamMap, Params } from '@angular/router';
import { tamanoPaginaDesdeTexto, tamanoPaginaParaUrl } from '@vitrina/shared/ui';
import type { FiltroPlantillas } from '../models/plantilla';

export const PRIMERA_PAGINA_PLANTILLAS = 1;

/** Query params de la lista de plantillas (spec 47). */
export const PARAMETRO_URL_PLANTILLAS = { busqueda: 'q', pagina: 'pagina', tamano: 'tamano' } as const;

export function filtroPlantillasDesdeUrl(parametros: ParamMap): FiltroPlantillas {
  return {
    q: parametros.get(PARAMETRO_URL_PLANTILLAS.busqueda)?.trim() || undefined,
    pagina: paginaDesdeTexto(parametros.get(PARAMETRO_URL_PLANTILLAS.pagina)),
    tamano: tamanoPaginaDesdeTexto(parametros.get(PARAMETRO_URL_PLANTILLAS.tamano)),
  };
}

/** La primera página y el tamaño por defecto quedan fuera de la URL. */
export function parametrosUrlPlantillas(filtro: FiltroPlantillas): Params {
  return {
    [PARAMETRO_URL_PLANTILLAS.busqueda]: filtro.q ?? null,
    [PARAMETRO_URL_PLANTILLAS.pagina]: filtro.pagina > PRIMERA_PAGINA_PLANTILLAS ? filtro.pagina : null,
    [PARAMETRO_URL_PLANTILLAS.tamano]: tamanoPaginaParaUrl(filtro.tamano),
  };
}

function paginaDesdeTexto(texto: string | null): number {
  const pagina = Number(texto);
  return Number.isInteger(pagina) && pagina >= PRIMERA_PAGINA_PLANTILLAS ? pagina : PRIMERA_PAGINA_PLANTILLAS;
}
