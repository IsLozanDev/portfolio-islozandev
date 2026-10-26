import { PRIMARY_OUTLET, type Router, type UrlTree } from '@angular/router';

export const PARAMETRO_RETORNO = 'returnUrl';

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
