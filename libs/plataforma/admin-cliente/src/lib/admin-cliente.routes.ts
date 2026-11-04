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
  {
    path: 'perfiles',
    canMatch: [permisoGuard(PERMISOS_ADMIN.perfilGestionar)],
    loadComponent: () => import('./pages/perfiles-lista/perfiles-lista.page').then((modulo) => modulo.PerfilesListaPage),
  },
  {
    path: 'perfiles/nuevo',
    canMatch: [permisoGuard(PERMISOS_ADMIN.perfilGestionar)],
    loadComponent: () => import('./pages/perfil-nuevo/perfil-nuevo.page').then((modulo) => modulo.PerfilNuevoPage),
  },
  {
    path: 'perfiles/:perfilId',
    canMatch: [permisoGuard(PERMISOS_ADMIN.perfilGestionar)],
    loadComponent: () => import('./pages/perfil-detalle/perfil-detalle.page').then((modulo) => modulo.PerfilDetallePage),
  },
  {
    path: 'perfiles/:perfilId/copiar',
    canMatch: [permisoGuard(PERMISOS_ADMIN.perfilGestionar)],
    loadComponent: () => import('./pages/perfil-copia/perfil-copia.page').then((modulo) => modulo.PerfilCopiaPage),
  },
  {
    path: 'empresas',
    canMatch: [permisoGuard(PERMISOS_ADMIN.organizacionConsultar)],
    loadComponent: () => import('./pages/empresas-lista/empresas-lista.page').then((modulo) => modulo.EmpresasListaPage),
  },
  {
    path: 'empresas/nueva',
    canMatch: [permisoGuard(PERMISOS_ADMIN.empresaCrear)],
    loadComponent: () => import('./pages/empresa-formulario/empresa-formulario.page').then((modulo) => modulo.EmpresaFormularioPage),
  },
  {
    path: 'empresas/:empresaId/editar',
    canMatch: [permisoGuard(PERMISOS_ADMIN.empresaCrear)],
    loadComponent: () => import('./pages/empresa-formulario/empresa-formulario.page').then((modulo) => modulo.EmpresaFormularioPage),
  },
  {
    path: 'sucursales',
    canMatch: [permisoGuard(PERMISOS_ADMIN.organizacionConsultar)],
    loadComponent: () => import('./pages/sucursales-lista/sucursales-lista.page').then((modulo) => modulo.SucursalesListaPage),
  },
  {
    path: 'sucursales/nueva',
    canMatch: [permisoGuard(PERMISOS_ADMIN.sucursalGestionar)],
    loadComponent: () => import('./pages/sucursal-formulario/sucursal-formulario.page').then((modulo) => modulo.SucursalFormularioPage),
  },
  {
    path: 'sucursales/:sucursalId/editar',
    canMatch: [permisoGuard(PERMISOS_ADMIN.sucursalGestionar)],
    loadComponent: () => import('./pages/sucursal-formulario/sucursal-formulario.page').then((modulo) => modulo.SucursalFormularioPage),
  },
  {
    path: 'unidades',
    canMatch: [permisoGuard(PERMISOS_ADMIN.organizacionConsultar)],
    loadComponent: () => import('./pages/unidades-lista/unidades-lista.page').then((modulo) => modulo.UnidadesListaPage),
  },
  {
    path: 'unidades/nueva',
    canMatch: [permisoGuard(PERMISOS_ADMIN.unidadGestionar)],
    loadComponent: () => import('./pages/unidad-formulario/unidad-formulario.page').then((modulo) => modulo.UnidadFormularioPage),
  },
  {
    path: 'unidades/:unidadId/editar',
    canMatch: [permisoGuard(PERMISOS_ADMIN.unidadGestionar)],
    loadComponent: () => import('./pages/unidad-formulario/unidad-formulario.page').then((modulo) => modulo.UnidadFormularioPage),
  },
  {
    path: 'bitacora',
    canMatch: [permisoGuard(PERMISOS_ADMIN.seguridadBitacora)],
    loadComponent: () => import('./pages/bitacora-lista/bitacora-lista.page').then((modulo) => modulo.BitacoraListaPage),
  },
  {
    path: 'bitacora/:eventoId',
    canMatch: [permisoGuard(PERMISOS_ADMIN.seguridadBitacora)],
    loadComponent: () => import('./pages/bitacora-detalle/bitacora-detalle.page').then((modulo) => modulo.BitacoraDetallePage),
  },
  // Las asignaciones se gestionan en el detalle del miembro (D5 del spec 16a); la opción del menú sigue en el manifiesto.
  // Angular no admite canMatch junto a redirectTo: el permiso lo decide la ruta de destino.
  { path: 'asignaciones', redirectTo: 'usuarios' },
];
