import { Route } from '@angular/router';
import { rutasDelShell } from '@vitrina/shared/shell';
import { environment } from '../environments/environment';

/** El menú de `mi-contexto` trae también las opciones de la consola; aquí solo van las de admin. */
const PREFIJO_MENU_ADMIN = '/admin';
export const NOMBRE_APP = 'Administración';

/** Muestras de `shared/ui` y de `archivos-ui` para verificar en navegador; no existen en el build de producción. */
const RUTAS_DE_DESARROLLO: Route[] = [
  { path: 'dev/componentes', loadComponent: () => import('./pages/componentes/componentes.page').then((modulo) => modulo.ComponentesPage) },
  { path: 'dev/archivos', loadComponent: () => import('./pages/archivos-prueba/archivos-prueba.page').then((modulo) => modulo.ArchivosPruebaPage) },
];

export const appRoutes: Route[] = [
  { path: 'auth', loadChildren: () => import('@vitrina/shared/auth-ui').then((modulo) => modulo.AUTH_UI_ROUTES) },
  // Pública y sin sesión: el enlace firmado del pie de cada correo (spec 46).
  { path: 'preferencias', loadChildren: () => import('@vitrina/plataforma/preferencias-ui').then((modulo) => modulo.PREFERENCIAS_UI_ROUTES) },
  ...rutasDelShell([
    { path: '', pathMatch: 'full', loadComponent: () => import('./pages/inicio/inicio.page').then((modulo) => modulo.InicioPage) },
    { path: 'admin', loadChildren: () => import('@vitrina/plataforma/admin-cliente').then((modulo) => modulo.ADMIN_CLIENTE_ROUTES) },
    ...(environment.production ? [] : RUTAS_DE_DESARROLLO),
  ], NOMBRE_APP, PREFIJO_MENU_ADMIN),
];
