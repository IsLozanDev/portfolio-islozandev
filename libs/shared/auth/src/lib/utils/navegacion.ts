import { PRIMARY_OUTLET, type Router, type UrlTree } from '@angular/router';

export const PARAMETRO_RETORNO = 'returnUrl';
/** Entrada profunda desde otra app (U-06): URL absoluta a la que vuelve el enlace «Volver a …». */
export const PARAMETRO_VOLVER_A = 'volverA';

/** Árbol hacia `ruta` con `?returnUrl=<retorno>` para volver tras ingresar o verificar MFA. */
export function rutaConRetorno(router: Router, ruta: string, retorno: string): UrlTree {
  return router.createUrlTree([ruta], { queryParams: { [PARAMETRO_RETORNO]: retorno } });
}

/** Evita encadenar `?returnUrl=` si ya se está en esa ruta. */
export function estaEn(router: Router, ruta: string): boolean {
  const actual = router.parseUrl(router.url);
  const rutaActual = '/' + (actual.root.children[PRIMARY_OUTLET]?.segments.map((segmento) => segmento.path).join('/') ?? '');
  return rutaActual === ruta;
}

const INICIO_DE_RUTA_INTERNA = '/';
/** `//otro.sitio` y `/\otro.sitio` los navegadores los leen como otro origen. */
const PREFIJOS_DE_OTRO_ORIGEN = ['//', '/\\'];

/** `returnUrl` solo si es una ruta interna de la app (TR-RNF-012: sin redirección abierta). */
export function rutaDeRetorno(valor: string | null | undefined, porDefecto: string): string {
  if (!valor || !valor.startsWith(INICIO_DE_RUTA_INTERNA)) return porDefecto;
  if (PREFIJOS_DE_OTRO_ORIGEN.some((prefijo) => valor.startsWith(prefijo))) return porDefecto;
  return valor;
}

const PROTOCOLOS_DE_VUELTA = ['http:', 'https:'];

/**
 * `volverA` solo si es una URL absoluta http(s) cuyo origen exacto está en la lista blanca; si no, null
 * (TR-RNF-012: sin redirección abierta). Distinto de `returnUrl`, que solo admite rutas internas.
 */
export function urlDeVuelta(valor: string | null | undefined, origenesPermitidos: readonly string[]): string | null {
  if (!valor) return null;
  const url = urlAbsoluta(valor);
  if (!url || !PROTOCOLOS_DE_VUELTA.includes(url.protocol)) return null;
  return origenesPermitidos.includes(url.origin) ? url.href : null;
}

/** Sin base: una ruta relativa o `//host` no se interpreta y da null. */
function urlAbsoluta(valor: string): URL | null {
  try {
    return new URL(valor);
  } catch {
    return null;
  }
}
