import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { CONFIG_AUTH } from '../config/config';
import { SesionService } from '../services/sesion.service';

/** Para las páginas de ingreso: con sesión, a la portada. */
export const anonimoGuard: CanActivateFn = async () => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  const { rutas } = inject(CONFIG_AUTH);

  await sesion.iniciar();
  if (!sesion.autenticado()) return true;
  return router.createUrlTree([rutas.inicio]);
};
