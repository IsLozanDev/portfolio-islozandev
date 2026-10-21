import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Principal } from '../domain/principal.js';

export const PUBLICO = 'seg:publico';
/** El spec 07 pone esta misma metadata desde `@Permiso` cuando el permiso es sensible. */
export const REQUIERE_MFA = 'seg:requiere-mfa';

export const Publico = () => SetMetadata(PUBLICO, true);
export const RequiereMfa = () => SetMetadata(REQUIERE_MFA, true);

export interface SolicitudAutenticada {
  principal?: Principal;
}

export const PrincipalActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): Principal | undefined => ctx.switchToHttp().getRequest<SolicitudAutenticada>().principal,
);
