import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISO, type RequisitoPermiso } from './decoradores.js';
import { ResolverPermisosUseCase } from '../application/resolver-permisos.use-case.js';
import { AccesoDenegadoError } from '../domain/errores.js';
import { tieneMfa, type Principal } from '../domain/principal.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hook opcional para registrar denegaciones en seg.evento_seguridad (bitácora / modo sombra). */
export type RegistrarDenegacion = (p: Principal, codigo: string, permiso: string) => void;

/**
 * Autorización: tenant del token + sucursal de la cabecera X-Sucursal-Id + permiso efectivo.
 * Deja en req.contexto { tenantId, sucursalId, permisos } para los casos de uso.
 */
@Injectable()
export class PermisoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: ResolverPermisosUseCase,
    private readonly registrar: RegistrarDenegacion = () => undefined,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const p: Principal | undefined = req.principal;
    if (!p) return true; // endpoint público: lo resolvió AutenticacionGuard
    const req_ = this.reflector.getAllAndOverride<RequisitoPermiso | undefined>(PERMISO, [ctx.getHandler(), ctx.getClass()]);
    if (!req_) return true; // solo autenticación

    const denegar = (e: AccesoDenegadoError): never => {
      this.registrar(p, e.codigo, req_.codigo);
      throw new ForbiddenException({ codigo: e.codigo, mensaje: e.message });
    };
    if (!p.tenantId) denegar(new AccesoDenegadoError('SIN_TENANT', 'La sesión no tiene un tenant activo'));
    const sucursalId: string | undefined = req.headers?.['x-sucursal-id'];
    if (!sucursalId || !UUID.test(sucursalId)) denegar(new AccesoDenegadoError('SIN_SUCURSAL', 'Falta la cabecera X-Sucursal-Id'));
    if (req_.mfa && !tieneMfa(p)) denegar(new AccesoDenegadoError('MFA_REQUERIDA', 'Esta operación requiere verificación en dos pasos'));

    let permisos: Set<string>;
    try {
      permisos = await this.resolver.ejecutar(p.usuarioId, p.tenantId!, sucursalId!);
    } catch (e) {
      if (e instanceof AccesoDenegadoError) denegar(e);
      throw e;
    }
    if (!permisos!.has(req_.codigo)) denegar(new AccesoDenegadoError('SIN_PERMISO', `Falta el permiso ${req_.codigo}`));
    req.contexto = { tenantId: p.tenantId, sucursalId, permisos: permisos! };
    return true;
  }
}
