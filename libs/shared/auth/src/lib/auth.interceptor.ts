import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { CONFIG_AUTH, type ConfigAuthResuelta } from './config';
import { estaEn, rutaConRetorno } from './navegacion';
import { CABECERA_SUCURSAL, SesionService } from './sesion.service';

const HTTP_NO_AUTORIZADO = 401;
const CODIGO_MFA_REQUERIDA = 'MFA_REQUERIDA';
const CODIGO_TOKEN_INVALIDO = 'TOKEN_INVALIDO';

/**
 * Agrega Bearer y `X-Sucursal-Id` solo a las peticiones hacia `apiUrl`.
 * Ante 401 `MFA_REQUERIDA` lleva a la verificación (sin reintento); ante `TOKEN_INVALIDO` cierra la sesión.
 */
export const authInterceptor: HttpInterceptorFn = (peticion, siguiente) => {
  const config = inject(CONFIG_AUTH);
  if (!esDeLaApi(peticion.url, config.apiUrl)) return siguiente(peticion);

  const sesion = inject(SesionService);
  const router = inject(Router);
  return siguiente(conCredenciales(peticion, sesion)).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === HTTP_NO_AUTORIZADO) {
        atenderNoAutorizado(codigoDe(error), sesion, router, config);
      }
      return throwError(() => error);
    }),
  );
};

export function esDeLaApi(url: string, apiUrl: string): boolean {
  return url === apiUrl || url.startsWith(apiUrl + '/') || url.startsWith(apiUrl + '?');
}

function conCredenciales(peticion: HttpRequest<unknown>, sesion: SesionService): HttpRequest<unknown> {
  const token = sesion.token();
  const sucursalId = sesion.sucursalId();
  const cabeceras: Record<string, string> = {};
  if (token) cabeceras['Authorization'] = `Bearer ${token}`;
  if (sucursalId && !peticion.headers.has(CABECERA_SUCURSAL)) cabeceras[CABECERA_SUCURSAL] = sucursalId;
  return peticion.clone({ setHeaders: cabeceras });
}

function codigoDe(error: HttpErrorResponse): string | undefined {
  const cuerpo: unknown = error.error;
  if (typeof cuerpo !== 'object' || cuerpo === null || !('codigo' in cuerpo)) return undefined;
  return typeof cuerpo.codigo === 'string' ? cuerpo.codigo : undefined;
}

function atenderNoAutorizado(codigo: string | undefined, sesion: SesionService, router: Router, config: ConfigAuthResuelta): void {
  const retorno = router.url;
  if (codigo === CODIGO_MFA_REQUERIDA) {
    irConRetorno(router, config.rutas.mfa, retorno);
    return;
  }
  if (codigo === CODIGO_TOKEN_INVALIDO) {
    void sesion.salir().then(() => irConRetorno(router, config.rutas.ingresar, retorno));
  }
}

function irConRetorno(router: Router, ruta: string, retorno: string): void {
  if (estaEn(router, ruta)) return;
  void router.navigateByUrl(rutaConRetorno(router, ruta, retorno));
}
