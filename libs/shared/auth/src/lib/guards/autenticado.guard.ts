import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { CONFIG_AUTH } from '../config/config';
import { MfaService } from '../services/mfa.service';
import { SesionService } from '../services/sesion.service';
import { rutaConRetorno } from '../utils/navegacion';

/** Sesión, segundo factor, contexto con accesos y sucursal elegida, en ese orden. */
export const autenticadoGuard: CanActivateFn = async (_ruta, estado) => {
  const sesion = inject(SesionService);
  const mfa = inject(MfaService);
  const router = inject(Router);
  const { rutas } = inject(CONFIG_AUTH);

  await sesion.iniciar();
  if (!sesion.autenticado()) return rutaConRetorno(router, rutas.ingresar, estado.url);
  if (await mfa.requiereVerificacion()) return rutaConRetorno(router, rutas.mfa, estado.url);

  const contexto = sesion.contexto() ?? (await sesion.cargarContexto());
  if (contexto.sinAccesos) return router.createUrlTree([rutas.sinAccesos]);
  if (contexto.requiereSeleccion) return rutaConRetorno(router, rutas.seleccionarSucursal, estado.url);
  return true;
};
