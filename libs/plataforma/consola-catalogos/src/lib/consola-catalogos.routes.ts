import type { Routes } from '@angular/router';
import { permisoGuard } from '@vitrina/shared/auth';
import { PERMISOS_CATALOGOS } from './models/permisos-catalogos';

/** Rutas de catálogos de la consola; la app las monta bajo `consola/catalogos`, detrás de `aal2Guard`. `nuevo` va antes de `:codigo`. */
export const CONSOLA_CATALOGOS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canMatch: [permisoGuard(PERMISOS_CATALOGOS.leer)],
    loadComponent: () => import('./pages/catalogos-lista/catalogos-lista.page').then((modulo) => modulo.CatalogosListaPage),
  },
  {
    path: 'nuevo',
    canMatch: [permisoGuard(PERMISOS_CATALOGOS.gestionar)],
    loadComponent: () => import('./pages/catalogo-formulario/catalogo-formulario.page').then((modulo) => modulo.CatalogoFormularioPage),
  },
  {
    path: ':codigo/editar',
    canMatch: [permisoGuard(PERMISOS_CATALOGOS.gestionar)],
    loadComponent: () => import('./pages/catalogo-formulario/catalogo-formulario.page').then((modulo) => modulo.CatalogoFormularioPage),
  },
  {
    path: ':codigo/items/nuevo',
    canMatch: [permisoGuard(PERMISOS_CATALOGOS.itemGestionar)],
    loadComponent: () => import('./pages/item-formulario/item-formulario.page').then((modulo) => modulo.ItemFormularioPage),
  },
  {
    path: ':codigo/items/:id/editar',
    canMatch: [permisoGuard(PERMISOS_CATALOGOS.itemGestionar)],
    loadComponent: () => import('./pages/item-formulario/item-formulario.page').then((modulo) => modulo.ItemFormularioPage),
  },
  {
    path: ':codigo/importar',
    canMatch: [permisoGuard(PERMISOS_CATALOGOS.importar)],
    loadComponent: () => import('./pages/importacion/importacion.page').then((modulo) => modulo.ImportacionPage),
  },
  {
    path: ':codigo',
    canMatch: [permisoGuard(PERMISOS_CATALOGOS.leer)],
    loadComponent: () => import('./pages/catalogo-detalle/catalogo-detalle.page').then((modulo) => modulo.CatalogoDetallePage),
  },
];
