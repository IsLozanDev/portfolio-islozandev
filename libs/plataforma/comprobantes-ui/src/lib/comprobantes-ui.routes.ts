import type { Routes } from '@angular/router';
import { aal2Guard, permisoGuard } from '@vitrina/shared/auth';
import { PERMISOS_FE_UI } from './models/permisos-fe';

/** Rutas de facturación electrónica; `admin-cliente` las monta bajo `fe` (spec 62). */
export const FE_ROUTES: Routes = [
  {
    path: 'emisores',
    canMatch: [permisoGuard(PERMISOS_FE_UI.consultar)],
    loadComponent: () => import('./pages/emisores-lista/emisores-lista.page').then((modulo) => modulo.EmisoresListaPage),
  },
  {
    // Todas las acciones de la página son sensibles: aal2 al entrar, como la consola. La lista no lo exige.
    path: 'emisores/:empresaId',
    canMatch: [permisoGuard(PERMISOS_FE_UI.consultar)],
    canActivate: [aal2Guard],
    loadComponent: () => import('./pages/emisor-configuracion/emisor-configuracion.page').then((modulo) => modulo.EmisorConfiguracionPage),
  },
];
