import { Route } from '@angular/router';
import { aal2Guard } from '@vitrina/shared/auth';
import { rutasDelShell } from '@vitrina/shared/shell';

export const NOMBRE_APP = 'Consola de plataforma';
/** El menú de `mi-contexto` trae también las opciones de admin; aquí solo van las de la consola. */
export const PREFIJO_MENU_CONSOLA = '/consola';

/** Toda la consola exige aal2 (TR-RN-009); el guard corre antes de pintar el layout. */
export const appRoutes: Route[] = [
  { path: 'auth', loadChildren: () => import('@vitrina/shared/auth-ui').then((modulo) => modulo.AUTH_UI_ROUTES) },
  ...rutasDelShell(
    [
      { path: '', pathMatch: 'full', redirectTo: 'consola/tenants' },
      {
        path: 'consola',
        canActivate: [aal2Guard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'tenants' },
          { path: 'tenants', loadComponent: () => import('./pages/tenants-provisional/tenants-provisional.page').then((modulo) => modulo.TenantsProvisionalPage) },
        ],
      },
    ],
    NOMBRE_APP,
    PREFIJO_MENU_CONSOLA,
  ),
];
