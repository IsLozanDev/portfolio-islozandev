import { inject } from '@angular/core';
import { Router, type CanActivateFn, type CanMatchFn } from '@angular/router';
import { SesionService } from './sesion.service';

/** Exige sesión; si el usuario tiene MFA pendiente lo lleva a verificarlo. */
export const autenticadoGuard: CanActivateFn = async () => {
  const s = inject(SesionService); const r = inject(Router);
  if (!s.autenticado()) return r.createUrlTree(['/auth/ingresar']);
  if (await s.requiereMfa()) return r.createUrlTree(['/auth/mfa']);
  if (!s.contexto()) await s.cargarContexto();
  if (!s.sucursalId()) return r.createUrlTree(['/seleccionar-sucursal']);
  return true;
};

/** Carga lazy de una ruta solo si el usuario tiene el permiso. La API vuelve a validarlo siempre. */
export const permisoGuard = (permiso: string): CanMatchFn => () => inject(SesionService).tiene(permiso);
