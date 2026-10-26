import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  { path: '', loadComponent: () => import('./pages/inicio/inicio.page').then((modulo) => modulo.InicioPage) },
];
