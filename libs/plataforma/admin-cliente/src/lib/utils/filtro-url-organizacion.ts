import type { ParamMap } from '@angular/router';

/** La API pagina de 20 en 20 por defecto (spec 17a); las listas de organización usan ese tamaño fijo. */
export const TAMANO_PAGINA_ORGANIZACION = 20;
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
