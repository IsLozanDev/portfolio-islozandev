import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { MfaRequeridaError } from '../domain/errores.js';
import { mfaVigente } from '../domain/principal.js';
import { REQUIERE_MFA, type SolicitudAutenticada } from './decoradores.js';
import { rechazar } from './respuestas.js';

/** TR-RF-017: corre después de AutenticacionGuard y solo actúa en rutas con `@RequiereMfa()`. */
export class MfaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly maxEdadSeg: number,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.reflector.getAllAndOverride<boolean>(REQUIERE_MFA, [ctx.getHandler(), ctx.getClass()])) return true;

    const principal = ctx.switchToHttp().getRequest<SolicitudAutenticada>().principal;
    // Ruta @Publico con @RequiereMfa: sin principal no hay MFA que comprobar.
    if (!principal) {
      throw rechazar(ctx, { estado: 401, cuerpo: { codigo: 'TOKEN_INVALIDO' }, wwwAuthenticate: 'Bearer error="invalid_token"', motivo: 'sin_principal' });
    }
    if (mfaVigente(principal, new Date(), this.maxEdadSeg)) return true;

    const e = new MfaRequeridaError(this.maxEdadSeg);
    throw rechazar(ctx, {
      estado: 401,
      cuerpo: { codigo: e.code, max_edad: this.maxEdadSeg },
      // RFC 9470 (step-up authentication challenge).
      wwwAuthenticate: `Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=${this.maxEdadSeg}`,
      motivo: principal.aal === 'aal2' ? 'mfa_vencido' : 'aal1',
      usuarioId: principal.usuarioId,
    });
  }
}
