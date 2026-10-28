import { Route } from '@angular/router';
import { rutasDelShell } from '@vitrina/shared/shell';
import { environment } from '../environments/environment';

/** Muestra de `shared/ui` para verificar en navegador; no existe en el build de producción. */
const RUTAS_DE_DESARROLLO: Route[] = [
  { path: 'dev/componentes', loadComponent: () => import('./pages/componentes/componentes.page').then((modulo) => modulo.ComponentesPage) },
];

export const appRoutes: Route[] = [
  { path: 'auth', loadChildren: () => import('@vitrina/shared/auth-ui').then((modulo) => modulo.AUTH_UI_ROUTES) },
  ...rutasDelShell([
    { path: '', pathMatch: 'full', loadComponent: () => import('./pages/inicio/inicio.page').then((modulo) => modulo.InicioPage) },
    { path: 'admin', loadChildren: () => import('@vitrina/plataforma/admin-cliente').then((modulo) => modulo.ADMIN_CLIENTE_ROUTES) },
    ...(environment.production ? [] : RUTAS_DE_DESARROLLO),
  ]),
];
