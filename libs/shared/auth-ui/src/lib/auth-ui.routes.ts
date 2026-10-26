import type { Routes } from '@angular/router';
import { anonimoGuard } from '@vitrina/shared/auth';

/** Rutas bajo `/auth`; coinciden con `RUTAS_AUTH_POR_DEFECTO` de `shared/auth`. */
export const AUTH_UI_ROUTES: Routes = [
  {
    path: 'ingresar',
    canActivate: [anonimoGuard],
    loadComponent: () => import('./pages/ingresar/ingresar.page').then((modulo) => modulo.IngresarPage),
  },
];
