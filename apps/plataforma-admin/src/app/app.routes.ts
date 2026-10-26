import { Route } from '@angular/router';
import { rutasDelShell } from '@vitrina/shared/shell';

export const appRoutes: Route[] = [
  { path: 'auth', loadChildren: () => import('@vitrina/shared/auth-ui').then((modulo) => modulo.AUTH_UI_ROUTES) },
  ...rutasDelShell([
    { path: '', pathMatch: 'full', loadComponent: () => import('./pages/inicio/inicio.page').then((modulo) => modulo.InicioPage) },
  ]),
];
