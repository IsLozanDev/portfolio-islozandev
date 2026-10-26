import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  { path: 'auth', loadChildren: () => import('@vitrina/shared/auth-ui').then((modulo) => modulo.AUTH_UI_ROUTES) },
  { path: '', loadComponent: () => import('./pages/inicio/inicio.page').then((modulo) => modulo.InicioPage) },
];
