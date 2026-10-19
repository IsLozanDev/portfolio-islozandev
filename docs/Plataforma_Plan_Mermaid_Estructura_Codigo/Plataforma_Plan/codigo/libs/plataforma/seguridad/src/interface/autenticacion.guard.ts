import { Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ES_PUBLICO } from './decoradores.js';
import { VERIFICADOR_TOKEN, type VerificadorToken } from '../application/ports/verificador-token.port.js';
import { TokenInvalidoError } from '../domain/errores.js';

/** Guard global: todo endpoint exige token salvo los marcados con @Publico(). */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(VERIFICADOR_TOKEN) private readonly verificador: VerificadorToken,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const cabecera: string | undefined = req.headers?.authorization;
    const token = cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Falta el token de acceso');
    try {
      req.principal = await this.verificador.verificar(token);
      return true;
    } catch (e) {
      if (e instanceof TokenInvalidoError) throw new UnauthorizedException(e.message);
      throw e;
    }
  }
}
