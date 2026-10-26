import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { CONFIG_AUTH } from '../config/config';
import { SesionService } from '../services/sesion.service';
import { rutaConRetorno } from '../utils/navegacion';

/** Solo exige sesión. Para `/auth/mfa`, el selector y "sin accesos", donde `autenticadoGuard` haría un ciclo. */
export const sesionGuard: CanActivateFn = async (_ruta, estado) => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  const { rutas } = inject(CONFIG_AUTH);

  await sesion.iniciar();
  if (sesion.autenticado()) return true;
  return rutaConRetorno(router, rutas.ingresar, estado.url);
};
