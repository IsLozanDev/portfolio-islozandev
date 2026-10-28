import type { Routes } from '@angular/router';
import { permisoGuard } from '@vitrina/shared/auth';
import { PERMISOS_CONSOLA } from './models/permisos-consola';

/** Rutas de tenants de la consola; la app las monta bajo `consola`, detrás de `aal2Guard`. */
export const CONSOLA_TENANTS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tenants' },
  {
    path: 'tenants',
    canMatch: [permisoGuard(PERMISOS_CONSOLA.tenantConsultar)],
    loadComponent: () => import('./pages/tenants-lista/tenants-lista.page').then((modulo) => modulo.TenantsListaPage),
  },
];
