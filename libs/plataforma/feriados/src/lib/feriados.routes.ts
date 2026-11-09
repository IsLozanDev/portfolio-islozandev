import type { Routes } from '@angular/router';

/**
 * La app las monta con `data.alcances` y el `permisoGuard(plat.feriado.gestionar)`: la consola con
 * `['GLOBAL']` y admin con `['TENANT', 'SUCURSAL']`. La página hereda la `data` de esa ruta.
 */
export const FERIADOS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/feriados/feriados.page').then((modulo) => modulo.FeriadosPage),
  },
];
