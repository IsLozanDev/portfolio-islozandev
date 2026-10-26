import { inject } from '@angular/core';
import { Router, type CanActivateFn, type CanMatchFn, type UrlTree } from '@angular/router';
import { CONFIG_AUTH } from './config';
import { MfaService } from './mfa.service';
import { rutaConRetorno } from './navegacion';
import { SesionService } from './sesion.service';

/** Sesión, segundo factor, contexto con accesos y sucursal elegida, en ese orden. */
export const autenticadoGuard: CanActivateFn = async (_ruta, estado) => {
  const sesion = inject(SesionService);
  const mfa = inject(MfaService);
  const router = inject(Router);
  const { rutas } = inject(CONFIG_AUTH);

  await sesion.iniciar();
  if (!sesion.autenticado()) return rutaConRetorno(router, rutas.ingresar, estado.url);
  if (await mfa.requiereVerificacion()) return rutaConRetorno(router, rutas.mfa, estado.url);

  const contexto = sesion.contexto() ?? (await sesion.cargarContexto());
  if (contexto.sinAccesos) return router.createUrlTree([rutas.sinAccesos]);
  if (contexto.requiereSeleccion) return rutaConRetorno(router, rutas.seleccionarSucursal, estado.url);
  return true;
};

/** Para las páginas de ingreso: con sesión, a la portada. */
export const anonimoGuard: CanActivateFn = async () => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  const { rutas } = inject(CONFIG_AUTH);

  await sesion.iniciar();
  if (!sesion.autenticado()) return true;
  return router.createUrlTree([rutas.inicio]);
};

/** Exige sesión aal2 (p. ej. la consola). La recencia de 15 min la valida la API. */
export const aal2Guard: CanActivateFn = async (_ruta, estado) => {
  const sesion = inject(SesionService);
  const mfa = inject(MfaService);
  const router = inject(Router);
  const { rutas } = inject(CONFIG_AUTH);

  await sesion.iniciar();
  if (!sesion.autenticado()) return rutaConRetorno(router, rutas.ingresar, estado.url);
  if (await mfa.tieneNivelMfa()) return true;
  return rutaConRetorno(router, rutas.mfa, estado.url);
};

/** Con una lista basta con tener cualquiera de los permisos (OR). */
export function permisoGuard(permisoOPermisos: string | readonly string[]): CanMatchFn {
  return async (): Promise<boolean | UrlTree> => {
    const sesion = inject(SesionService);
    const router = inject(Router);
    const { rutas } = inject(CONFIG_AUTH);

    await sesion.iniciar();
    if (sesion.tiene(permisoOPermisos)) return true;
    return router.createUrlTree([rutas.prohibido]);
  };
}
