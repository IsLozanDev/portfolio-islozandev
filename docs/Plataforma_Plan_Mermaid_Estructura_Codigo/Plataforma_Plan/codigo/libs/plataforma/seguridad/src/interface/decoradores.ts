import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Principal } from '../domain/principal.js';

export const ES_PUBLICO = 'seg:publico';
export const PERMISO = 'seg:permiso';

export interface OpcionesPermiso {
  /** Exige que la sesión haya completado MFA (aal2). TR-RF-017 */
  mfa?: boolean;
}
export interface RequisitoPermiso { codigo: string; mfa: boolean }

/** Endpoint sin autenticación (salud, webhooks firmados, sitio público). */
export const Publico = () => SetMetadata(ES_PUBLICO, true);

/** @Permiso('plat.usuario.invitar') · @Permiso('plat.rol.editar', { mfa: true }) */
export const Permiso = (codigo: string, op: OpcionesPermiso = {}) =>
  SetMetadata(PERMISO, { codigo, mfa: op.mfa ?? false } satisfies RequisitoPermiso);

export const UsuarioActual = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal =>
  ctx.switchToHttp().getRequest().principal);
