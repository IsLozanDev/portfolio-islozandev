import type { Routes } from '@angular/router';
import { permisoGuard } from '@vitrina/shared/auth';
import { PERMISO_SOLICITAR_SOPORTE } from './models/mensajes-soporte';

/**
 * Rutas del agente de soporte (spec 18); la app las monta bajo `consola/soporte`, detrás de `aal2Guard`,
 * con la URL de `plataforma-admin` en `data.urlAdministracion`.
 */
export const CONSOLA_SOPORTE_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canMatch: [permisoGuard(PERMISO_SOLICITAR_SOPORTE)],
    loadComponent: () => import('./pages/accesos-soporte/accesos-soporte.page').then((modulo) => modulo.AccesosSoportePage),
  },
  {
    path: 'solicitar',
    canMatch: [permisoGuard(PERMISO_SOLICITAR_SOPORTE)],
    loadComponent: () => import('./pages/solicitar-soporte/solicitar-soporte.page').then((modulo) => modulo.SolicitarSoportePage),
  },
];
