import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import type { Routes } from '@angular/router';

/** La fija el layout de `shared/shell` al montarse; esta página vive fuera del shell. */
const CLASE_FUENTE_ICONOS = 'material-symbols-outlined';

/** `/preferencias`, pública y fuera del shell (spec 46). */
export const PREFERENCIAS_UI_ROUTES: Routes = [
  {
    path: '',
    providers: [{ provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: CLASE_FUENTE_ICONOS } }],
    loadComponent: () => import('./pages/preferencias/preferencias.page').then((modulo) => modulo.PreferenciasPage),
  },
];
