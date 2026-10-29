import type { Routes } from '@angular/router';
import { autenticadoGuard, sesionGuard } from '@vitrina/shared/auth';
import { CLAVE_NOMBRE_APP, CLAVE_PREFIJO_MENU } from './models/datos-ruta-shell';
import { MENSAJES_SHELL } from './models/mensajes-shell';

/**
 * Rutas del shell alrededor de las páginas de la app (`hijas`, dentro del layout).
 * Selección de sucursal y sin accesos quedan fuera del layout y usan `sesionGuard`:
 * con `autenticadoGuard` se redirigirían a sí mismas. La app pone `/auth` antes.
 * `nombreApp` aparece en la barra superior. Con `prefijoMenu` el menú muestra solo las opciones de
 * la app (p. ej. `/consola`), porque `mi-contexto` trae las de todas las apps del producto.
 */
export function rutasDelShell(hijas: Routes, nombreApp: string = MENSAJES_SHELL.nombreAppPorDefecto, prefijoMenu?: string): Routes {
  return [
    {
      path: 'seleccionar-sucursal',
      canActivate: [sesionGuard],
      loadComponent: () => import('./pages/seleccionar-sucursal/seleccionar-sucursal.page').then((modulo) => modulo.SeleccionarSucursalPage),
    },
    {
      path: 'sin-accesos',
      canActivate: [sesionGuard],
      loadComponent: () => import('./pages/sin-accesos/sin-accesos.page').then((modulo) => modulo.SinAccesosPage),
    },
    {
      path: '',
      canActivate: [autenticadoGuard],
      data: { [CLAVE_NOMBRE_APP]: nombreApp, ...(prefijoMenu ? { [CLAVE_PREFIJO_MENU]: prefijoMenu } : {}) },
      loadComponent: () => import('./components/layout/layout.component').then((modulo) => modulo.LayoutComponent),
      children: [
        ...hijas,
        { path: '403', loadComponent: () => import('./pages/prohibido/prohibido.page').then((modulo) => modulo.ProhibidoPage) },
        { path: '**', loadComponent: () => import('./pages/no-encontrado/no-encontrado.page').then((modulo) => modulo.NoEncontradoPage) },
      ],
    },
  ];
}
