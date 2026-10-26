import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { CONFIG_AUTH } from '../config/config';
import { MfaService } from '../services/mfa.service';
import { SesionService } from '../services/sesion.service';
import { rutaConRetorno } from '../utils/navegacion';

/** Exige sesión aal2 (p. ej. la consola). La recencia de 15 min la valida la API. */
export const aal2Guard: CanActivateFn = async (_ruta, estado) => {
  const sesion = inject(SesionService);
  const mfa = inject(MfaService);
  const router = inject(Router);
  const { rutas } = inject(CONFIG_AUTH);

  await sesion.iniciar();
  if (!sesion.autenticado()) return rutaConRetorno(router, rutas.ingresar, estado.url);
  if (await mfa.tieneNivelMfa()) return true;
  return rutaConRetorno(router, rutas.mfa, estado.url);
};
