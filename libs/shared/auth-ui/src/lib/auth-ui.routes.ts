import type { Routes } from '@angular/router';
import { anonimoGuard } from '@vitrina/shared/auth';

/** Rutas bajo `/auth`; coinciden con `RUTAS_AUTH_POR_DEFECTO` de `shared/auth`. */
export const AUTH_UI_ROUTES: Routes = [
  {
    path: 'ingresar',
    canActivate: [anonimoGuard],
    loadComponent: () => import('./pages/ingresar/ingresar.page').then((modulo) => modulo.IngresarPage),
  },
  {
    path: 'callback',
    loadComponent: () => import('./pages/callback/callback.page').then((modulo) => modulo.CallbackPage),
  },
  {
    path: 'recuperar',
    canActivate: [anonimoGuard],
    loadComponent: () => import('./pages/recuperar/recuperar.page').then((modulo) => modulo.RecuperarPage),
  },
  {
    path: 'nueva-clave',
    loadComponent: () => import('./pages/nueva-clave/nueva-clave.page').then((modulo) => modulo.NuevaClavePage),
  },
];
