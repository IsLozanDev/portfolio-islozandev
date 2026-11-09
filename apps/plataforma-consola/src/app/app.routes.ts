import { Route } from '@angular/router';
import { aal2Guard, permisoGuard } from '@vitrina/shared/auth';
import { rutasDelShell } from '@vitrina/shared/shell';
import { environment } from '../environments/environment';

export const NOMBRE_APP = 'Consola de plataforma';
/** El menú de `mi-contexto` trae también las opciones de admin; aquí solo van las de la consola. */
export const PREFIJO_MENU_CONSOLA = '/consola';
const PERMISO_FERIADOS = 'plat.feriado.gestionar';
/** La consola solo gestiona los feriados nacionales (spec 19e). */
const ALCANCES_FERIADOS_CONSOLA = ['GLOBAL'];

/** Toda la consola exige aal2 (TR-RN-009); el guard corre antes de pintar el layout. */
export const appRoutes: Route[] = [
  { path: 'auth', loadChildren: () => import('@vitrina/shared/auth-ui').then((modulo) => modulo.AUTH_UI_ROUTES) },
  ...rutasDelShell(
    [
      { path: '', pathMatch: 'full', redirectTo: 'consola/tenants' },
      {
        path: 'consola/soporte',
        canActivate: [aal2Guard],
        data: { urlAdministracion: environment.urlAdministracion },
        loadChildren: () => import('@vitrina/plataforma/consola-soporte').then((modulo) => modulo.CONSOLA_SOPORTE_ROUTES),
      },
      {
        path: 'consola/catalogos',
        canActivate: [aal2Guard],
        loadChildren: () => import('@vitrina/plataforma/consola-catalogos').then((modulo) => modulo.CONSOLA_CATALOGOS_ROUTES),
      },
      {
        path: 'consola/feriados',
        canActivate: [aal2Guard],
        canMatch: [permisoGuard(PERMISO_FERIADOS)],
        data: { alcances: ALCANCES_FERIADOS_CONSOLA },
        loadChildren: () => import('@vitrina/plataforma/feriados').then((modulo) => modulo.FERIADOS_ROUTES),
      },
      {
        path: 'consola',
        canActivate: [aal2Guard],
        loadChildren: () => import('@vitrina/plataforma/consola-tenants').then((modulo) => modulo.CONSOLA_TENANTS_ROUTES),
      },
    ],
    NOMBRE_APP,
    PREFIJO_MENU_CONSOLA,
  ),
];
