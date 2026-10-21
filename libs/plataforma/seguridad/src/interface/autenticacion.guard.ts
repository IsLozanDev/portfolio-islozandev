import { Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { RegistroAcceso } from '../application/ports/registro-acceso.port.js';
import type { VerificadorToken } from '../application/ports/verificador-token.port.js';
import { AutenticacionNoDisponibleError, TokenInvalidoError } from '../domain/errores.js';
import { PUBLICO, type SolicitudAutenticada } from './decoradores.js';
import { rechazar } from './respuestas.js';

interface Solicitud extends SolicitudAutenticada {
  headers: Record<string, string | string[] | undefined>;
}

const TOKEN_INVALIDO = { estado: 401, cuerpo: { codigo: 'TOKEN_INVALIDO' }, wwwAuthenticate: 'Bearer error="invalid_token"' } as const;

/** Guard global: toda ruta sin `@Publico()` exige un Bearer válido. */
export class AutenticacionGuard implements CanActivate {
  private readonly logger = new Logger(AutenticacionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly verificador: VerificadorToken,
    private readonly registroAcceso: RegistroAcceso,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest<Solicitud>();
    const cabecera = req.headers['authorization'];
    const token = typeof cabecera === 'string' ? /^Bearer\s+(\S+)$/i.exec(cabecera)?.[1] : undefined;
    if (!token) throw rechazar(ctx, { ...TOKEN_INVALIDO, motivo: 'sin_bearer' });

    try {
      req.principal = await this.verificador.verificar(token);
    } catch (e) {
      if (e instanceof TokenInvalidoError) throw rechazar(ctx, { ...TOKEN_INVALIDO, motivo: e.motivo });
      if (e instanceof AutenticacionNoDisponibleError) {
        throw rechazar(ctx, { estado: 503, cuerpo: { codigo: e.code }, motivo: 'jwks' });
      }
      throw e;
    }

    this.registroAcceso.marcar(req.principal.usuarioId).catch((e: unknown) => {
      this.logger.warn({ evento: 'auth.ultimo_acceso.error', error: e instanceof Error ? e.name : typeof e });
    });
    return true;
  }
}
