import type { Routes } from '@angular/router';
import { permisoGuard } from '@vitrina/shared/auth';
import { PERMISOS_ADMIN } from './models/permisos-admin';

/** Rutas de la administración del cliente; la app anfitriona las monta bajo `admin` (TR-RNF-122). */
export const ADMIN_CLIENTE_ROUTES: Routes = [
  {
    path: 'usuarios',
    canMatch: [permisoGuard(PERMISOS_ADMIN.usuarioInvitar)],
    loadComponent: () => import('./pages/usuarios-lista/usuarios-lista.page').then((modulo) => modulo.UsuariosListaPage),
  },
  // Las asignaciones se gestionan en el detalle del miembro (D5 del spec 16a); la opción del menú sigue en el manifiesto.
  // Angular no admite canMatch junto a redirectTo: el permiso lo decide la ruta de destino.
  { path: 'asignaciones', redirectTo: 'usuarios' },
];
