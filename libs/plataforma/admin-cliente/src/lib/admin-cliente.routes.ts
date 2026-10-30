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
  {
    path: 'usuarios/invitar',
    canMatch: [permisoGuard(PERMISOS_ADMIN.usuarioInvitar)],
    loadComponent: () => import('./pages/usuarios-invitar/usuarios-invitar.page').then((modulo) => modulo.UsuariosInvitarPage),
  },
  {
    path: 'usuarios/:membresiaId',
    canMatch: [permisoGuard(PERMISOS_ADMIN.usuarioInvitar)],
    loadComponent: () => import('./pages/usuario-detalle/usuario-detalle.page').then((modulo) => modulo.UsuarioDetallePage),
  },
  {
    path: 'usuarios/:membresiaId/asignar',
    canMatch: [permisoGuard(PERMISOS_ADMIN.asignacionOtorgar)],
    loadComponent: () => import('./pages/asignacion-nueva/asignacion-nueva.page').then((modulo) => modulo.AsignacionNuevaPage),
  },
  {
    path: 'roles',
    canMatch: [permisoGuard(PERMISOS_ADMIN.rolGestionar)],
    loadComponent: () => import('./pages/roles-lista/roles-lista.page').then((modulo) => modulo.RolesListaPage),
  },
  {
    path: 'roles/nuevo',
    canMatch: [permisoGuard(PERMISOS_ADMIN.rolGestionar)],
    loadComponent: () => import('./pages/rol-nuevo/rol-nuevo.page').then((modulo) => modulo.RolNuevoPage),
  },
  {
    path: 'roles/:rolId',
    canMatch: [permisoGuard(PERMISOS_ADMIN.rolGestionar)],
    loadComponent: () => import('./pages/rol-detalle/rol-detalle.page').then((modulo) => modulo.RolDetallePage),
  },
  {
    path: 'roles/:rolId/copiar',
    canMatch: [permisoGuard(PERMISOS_ADMIN.rolGestionar)],
    loadComponent: () => import('./pages/rol-copia/rol-copia.page').then((modulo) => modulo.RolCopiaPage),
  },
  // Las asignaciones se gestionan en el detalle del miembro (D5 del spec 16a); la opción del menú sigue en el manifiesto.
  // Angular no admite canMatch junto a redirectTo: el permiso lo decide la ruta de destino.
  { path: 'asignaciones', redirectTo: 'usuarios' },
];
