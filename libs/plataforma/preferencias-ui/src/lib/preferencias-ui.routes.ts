import type { Routes } from '@angular/router';

/** `/preferencias`, pública y fuera del shell (spec 46). */
export const PREFERENCIAS_UI_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./pages/preferencias/preferencias.page').then((modulo) => modulo.PreferenciasPage) },
];
