import type { Params, ParamMap } from '@angular/router';
import { ESTADOS_TENANT, PRODUCTOS, type EstadoTenant, type ProductoCodigo } from '../models/catalogos';
import { TAMANO_PAGINA } from '../models/listado';
import type { FiltroTenants } from '../models/tenant';

/** Nombres de los query params de la lista; los mismos que la API. */
export const PARAMETRO_URL = { busqueda: 'q', estado: 'estado', producto: 'producto', pagina: 'pagina' } as const;

const PRIMERA_PAGINA = 1;

/** Filtro de la lista desde la URL. Un valor que no es del catálogo se ignora. */
export function filtroDesdeUrl(parametros: ParamMap): FiltroTenants {
  const pagina = Number(parametros.get(PARAMETRO_URL.pagina));
  return {
    q: parametros.get(PARAMETRO_URL.busqueda)?.trim() || undefined,
    estado: delCatalogo(ESTADOS_TENANT, parametros.get(PARAMETRO_URL.estado)) as EstadoTenant | undefined,
    producto: delCatalogo(PRODUCTOS, parametros.get(PARAMETRO_URL.producto)) as ProductoCodigo | undefined,
    pagina: Number.isInteger(pagina) && pagina >= PRIMERA_PAGINA ? pagina : PRIMERA_PAGINA,
    tamano: TAMANO_PAGINA,
  };
}

/** Query params del filtro; los vacíos y la primera página quedan fuera de la URL. */
export function parametrosUrlDe(filtro: FiltroTenants): Params {
  return {
    [PARAMETRO_URL.busqueda]: filtro.q ?? null,
    [PARAMETRO_URL.estado]: filtro.estado ?? null,
    [PARAMETRO_URL.producto]: filtro.producto ?? null,
    [PARAMETRO_URL.pagina]: filtro.pagina > PRIMERA_PAGINA ? filtro.pagina : null,
  };
}

/** Valor con que `vit-filtros` precarga sus controles. */
export function valorFiltrosDe(filtro: FiltroTenants): Record<string, string | null> {
  return { busqueda: filtro.q ?? '', [PARAMETRO_URL.estado]: filtro.estado ?? null, [PARAMETRO_URL.producto]: filtro.producto ?? null };
}

function delCatalogo(catalogo: readonly string[], valor: string | null): string | undefined {
  return valor !== null && catalogo.includes(valor) ? valor : undefined;
}
