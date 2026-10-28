import { inject } from '@angular/core';
import { Router, type CanMatchFn, type UrlTree } from '@angular/router';
import { CONFIG_AUTH } from '../config/config';
import { SesionService } from '../services/sesion.service';

/**
 * Con una lista basta con tener cualquiera de los permisos (OR). Sin sesión deja pasar: `canMatch` corre
 * antes que el `autenticadoGuard` del layout, que lleva a ingresar con el `returnUrl` real (spec 16a).
 */
export function permisoGuard(permisoOPermisos: string | readonly string[]): CanMatchFn {
  return async (): Promise<boolean | UrlTree> => {
    const sesion = inject(SesionService);
    const router = inject(Router);
    const { rutas } = inject(CONFIG_AUTH);

    await sesion.iniciar();
    if (!sesion.autenticado() || sesion.tiene(permisoOPermisos)) return true;
    return router.createUrlTree([rutas.prohibido]);
  };
}
