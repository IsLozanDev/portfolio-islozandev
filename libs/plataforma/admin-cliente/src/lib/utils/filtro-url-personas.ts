import type { ParamMap, Params } from '@angular/router';
import { PRODUCTOS, ROLES_PERSONA, TIPOS_PERSONA, type CriteriosListado, type ProductoCodigo, type RolPersona, type TipoPersona } from '@vitrina/plataforma/personas-ui';
import { tamanoPaginaParaUrl } from '@vitrina/shared/ui';
import { paginaDesdeUrl, paginaParaUrl, tamanoDesdeUrl } from './filtro-url-organizacion';

/** Nombres de los query params de la lista de personas (spec 38). */
export const PARAMETRO_URL_PERSONAS = { q: 'q', tipo: 'tipo', producto: 'producto', rol: 'rol', pagina: 'pagina', tamano: 'tamano' } as const;

export interface FiltroPersonasUrl {
  q: string;
  tipoPersona: TipoPersona | null;
  producto: ProductoCodigo | null;
  rol: RolPersona | null;
  pagina: number;
  tamano: number;
}

/** El valor de la URL si es uno de la lista; si no, ninguno (un enlace viejo o editado a mano no rompe la lista). */
function deLaLista<Valor extends string>(lista: readonly Valor[], valor: string | null): Valor | null {
  return valor !== null && (lista as readonly string[]).includes(valor) ? (valor as Valor) : null;
}

export function filtroPersonasDesdeUrl(parametros: ParamMap): FiltroPersonasUrl {
  return {
    q: parametros.get(PARAMETRO_URL_PERSONAS.q)?.trim() ?? '',
    tipoPersona: deLaLista(TIPOS_PERSONA, parametros.get(PARAMETRO_URL_PERSONAS.tipo)),
    producto: deLaLista(PRODUCTOS, parametros.get(PARAMETRO_URL_PERSONAS.producto)),
    rol: deLaLista(ROLES_PERSONA, parametros.get(PARAMETRO_URL_PERSONAS.rol)),
    pagina: paginaDesdeUrl(parametros),
    tamano: tamanoDesdeUrl(parametros),
  };
}

/** Lo vacío y la primera página quedan fuera de la URL. */
export function parametrosDeFiltroPersonas(filtro: FiltroPersonasUrl): Params {
  return {
    [PARAMETRO_URL_PERSONAS.q]: filtro.q || null,
    [PARAMETRO_URL_PERSONAS.tipo]: filtro.tipoPersona,
    [PARAMETRO_URL_PERSONAS.producto]: filtro.producto,
    [PARAMETRO_URL_PERSONAS.rol]: filtro.rol,
    [PARAMETRO_URL_PERSONAS.pagina]: paginaParaUrl(filtro.pagina),
    [PARAMETRO_URL_PERSONAS.tamano]: tamanoPaginaParaUrl(filtro.tamano),
  };
}

export function criteriosDeFiltroPersonas(filtro: FiltroPersonasUrl): CriteriosListado {
  return {
    q: filtro.q || undefined,
    tipoPersona: filtro.tipoPersona ?? undefined,
    producto: filtro.producto ?? undefined,
    rol: filtro.rol ?? undefined,
    pagina: filtro.pagina,
    tamano: filtro.tamano,
  };
}
