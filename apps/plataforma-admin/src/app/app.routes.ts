import { Route } from '@angular/router';
import { autenticadoGuard, sesionGuard } from '@vitrina/shared/auth';

/** `seleccionar-sucursal`, `sin-accesos` y `403` usan `sesionGuard`: con `autenticadoGuard` se redirigirían a sí mismas. */
export const appRoutes: Route[] = [
  { path: 'auth', loadChildren: () => import('@vitrina/shared/auth-ui').then((modulo) => modulo.AUTH_UI_ROUTES) },
  {
    path: 'seleccionar-sucursal',
    canActivate: [sesionGuard],
    loadComponent: () => import('./pages/seleccionar-sucursal/seleccionar-sucursal.page').then((modulo) => modulo.SeleccionarSucursalPage),
  },
  {
    path: 'sin-accesos',
    canActivate: [sesionGuard],
    loadComponent: () => import('./pages/sin-accesos/sin-accesos.page').then((modulo) => modulo.SinAccesosPage),
  },
  {
    path: '403',
    canActivate: [sesionGuard],
    loadComponent: () => import('./pages/prohibido/prohibido.page').then((modulo) => modulo.ProhibidoPage),
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [autenticadoGuard],
    loadComponent: () => import('./pages/inicio/inicio.page').then((modulo) => modulo.InicioPage),
  },
];
