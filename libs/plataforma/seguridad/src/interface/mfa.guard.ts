import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { mfaVigente } from '../domain/principal.js';
import { REQUIERE_MFA, type SolicitudAutenticada } from './decoradores.js';
import { rechazar, rechazoMfa, TOKEN_INVALIDO } from './respuestas.js';

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
      throw rechazar(ctx, { ...TOKEN_INVALIDO, motivo: 'sin_principal' });
    }
    if (mfaVigente(principal, new Date(), this.maxEdadSeg)) return true;

    throw rechazar(ctx, rechazoMfa(principal, this.maxEdadSeg));
  }
}
