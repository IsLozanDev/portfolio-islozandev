import type { Routes } from '@angular/router';
import { permisoGuard } from '@vitrina/shared/auth';
import { PERMISOS_CONSOLA_IDENTIDAD } from './models/permisos-identidad';

/** Rutas de identidad de la consola; la app las monta bajo `consola/identidad`, detrás de `aal2Guard`. */
export const CONSOLA_IDENTIDAD_ROUTES: Routes = [
  {
    path: 'cuotas',
    canMatch: [permisoGuard(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar)],
    loadComponent: () => import('./pages/cuotas-lista/cuotas-lista.page').then((modulo) => modulo.CuotasListaPage),
  },
  {
    path: 'cuotas/:tenantId/:periodo',
    canMatch: [permisoGuard(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar)],
    loadComponent: () => import('./pages/cuota-detalle/cuota-detalle.page').then((modulo) => modulo.CuotaDetallePage),
  },
  {
    path: 'proveedores',
    canMatch: [permisoGuard(PERMISOS_CONSOLA_IDENTIDAD.proveedor)],
    loadComponent: () => import('./pages/proveedores-lista/proveedores-lista.page').then((modulo) => modulo.ProveedoresListaPage),
  },
];
