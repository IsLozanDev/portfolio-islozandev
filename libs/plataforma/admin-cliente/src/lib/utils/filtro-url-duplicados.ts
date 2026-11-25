import type { ParamMap, Params } from '@angular/router';
import type { CriteriosDuplicados } from '@vitrina/plataforma/personas-ui';
import { tamanoPaginaParaUrl } from '@vitrina/shared/ui';
import { paginaDesdeUrl, paginaParaUrl, tamanoDesdeUrl } from './filtro-url-organizacion';

/** Nombres de los query params de la lista de duplicados (spec 40). */
export const PARAMETRO_URL_DUPLICADOS = { persona: 'persona', pagina: 'pagina', tamano: 'tamano' } as const;

export interface FiltroDuplicadosUrl {
  personaId: string | null;
  pagina: number;
  tamano: number;
}

export function filtroDuplicadosDesdeUrl(parametros: ParamMap): FiltroDuplicadosUrl {
  return {
    personaId: parametros.get(PARAMETRO_URL_DUPLICADOS.persona)?.trim() || null,
    pagina: paginaDesdeUrl(parametros),
    tamano: tamanoDesdeUrl(parametros),
  };
}

/** Sin persona y en la primera página, la URL queda limpia. */
export function parametrosDeFiltroDuplicados(filtro: FiltroDuplicadosUrl): Params {
  return {
    [PARAMETRO_URL_DUPLICADOS.persona]: filtro.personaId,
    [PARAMETRO_URL_DUPLICADOS.pagina]: paginaParaUrl(filtro.pagina),
    [PARAMETRO_URL_DUPLICADOS.tamano]: tamanoPaginaParaUrl(filtro.tamano),
  };
}

export function criteriosDeFiltroDuplicados(filtro: FiltroDuplicadosUrl): CriteriosDuplicados {
  return { personaId: filtro.personaId, pagina: filtro.pagina, tamano: filtro.tamano };
}
