import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { CONFIG_AUTH } from '../config/config';
import { MfaService } from '../services/mfa.service';
import { SesionService } from '../services/sesion.service';
import type { ContextoUsuario } from '../models/mi-contexto';
import { rutaConRetorno } from '../utils/navegacion';

/** `mi-contexto` sin membresía activa: el token no trae `tenant_id` (invitado sin aceptar, membresía finalizada). */
const CODIGO_SIN_TENANT = 'SIN_TENANT';

/** Sesión, segundo factor, contexto con accesos y sucursal elegida, en ese orden. */
export const autenticadoGuard: CanActivateFn = async (_ruta, estado) => {
  const sesion = inject(SesionService);
  const mfa = inject(MfaService);
  const router = inject(Router);
  const { rutas } = inject(CONFIG_AUTH);

  await sesion.iniciar();
  if (!sesion.autenticado()) return rutaConRetorno(router, rutas.ingresar, estado.url);
  if (await mfa.requiereVerificacion()) return rutaConRetorno(router, rutas.mfa, estado.url);

  const contexto = sesion.contexto() ?? (await cargarContextoSiTieneTenant(sesion));
  if (!contexto || contexto.sinAccesos) return router.createUrlTree([rutas.sinAccesos]);
  if (contexto.requiereSeleccion) return rutaConRetorno(router, rutas.seleccionarSucursal, estado.url);
  return true;
};

/** Sin tenant, para el usuario es lo mismo que no tener accesos vigentes (TR-CA-046): `null`. */
async function cargarContextoSiTieneTenant(sesion: SesionService): Promise<ContextoUsuario | null> {
  try {
    return await sesion.cargarContexto();
  } catch (error) {
    if (esSinTenant(error)) return null;
    throw error;
  }
}

function esSinTenant(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === HttpStatusCode.Forbidden &&
    (error.error as { codigo?: unknown } | null)?.codigo === CODIGO_SIN_TENANT
  );
}
