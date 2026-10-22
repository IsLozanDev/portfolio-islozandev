import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { CodigoPermiso } from '../domain/codigo-permiso.js';
import type { Principal } from '../domain/principal.js';

export const PUBLICO = 'seg:publico';
export const REQUIERE_MFA = 'seg:requiere-mfa';
export const PERMISO = 'seg:permiso';

export const Publico = () => SetMetadata(PUBLICO, true);
export const RequiereMfa = () => SetMetadata(REQUIERE_MFA, true);

/**
 * `@Permiso('rest.caja.abrir')`. Un código mal formado falla al decorar, es decir al cargar el
 * módulo. Si el permiso es sensible, PermisoGuard exige MFA leyendo el catálogo (TR-RN-009).
 */
export const Permiso = (codigo: string) => {
  if (!CodigoPermiso.esValido(codigo)) throw new Error(`@Permiso: el código «${codigo}» no tiene el formato producto.recurso.accion`);
  return SetMetadata(PERMISO, codigo);
};

/** Lo deja PermisoGuard tras autorizar: la sucursal y la unidad ya están verificadas. */
export interface ContextoAutorizado {
  tenantId: string;
  sucursalId: string;
  unidadId: string | null;
  permisos: string[];
}

export interface SolicitudAutenticada {
  principal?: Principal;
  contexto?: ContextoAutorizado;
}

export const PrincipalActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): Principal | undefined => ctx.switchToHttp().getRequest<SolicitudAutenticada>().principal,
);
