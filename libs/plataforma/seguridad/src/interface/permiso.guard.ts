import { Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { BitacoraSeguridad, CatalogoPermisos } from '../application/ports/repositorios.js';
import type { ResolverPermisos } from '../application/resolver-permisos.js';
import { SucursalNoAsignadaError } from '../domain/errores.js';
import { mfaVigente } from '../domain/principal.js';
import { PERMISO, type SolicitudAutenticada } from './decoradores.js';
import { cabecera, rechazar, rechazoMfa, TOKEN_INVALIDO, UUID } from './respuestas.js';

interface Solicitud extends SolicitudAutenticada {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
}

/**
 * TR-RF-016: corre después de AutenticacionGuard y MfaGuard y solo actúa en rutas con `@Permiso`.
 * Deja en `req.contexto` el tenant, la sucursal y la unidad verificadas y los permisos efectivos.
 */
export class PermisoGuard implements CanActivate {
  private readonly logger = new Logger(PermisoGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: ResolverPermisos,
    private readonly catalogo: CatalogoPermisos,
    private readonly bitacora: BitacoraSeguridad,
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly maxEdadSeg: number,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const permiso = this.reflector.getAllAndOverride<string | undefined>(PERMISO, [ctx.getHandler(), ctx.getClass()]);
    if (!permiso) return true;

    const req = ctx.switchToHttp().getRequest<Solicitud>();
    const principal = req.principal;
    // Ruta @Publico con @Permiso: sin principal no hay a quién autorizar.
    if (!principal) throw rechazar(ctx, { ...TOKEN_INVALIDO, motivo: 'sin_principal' });
    const { usuarioId, tenantId } = principal;
    if (!tenantId) throw rechazar(ctx, { estado: 403, cuerpo: { codigo: 'SIN_TENANT' }, motivo: 'sin_tenant', usuarioId });

    const sucursalId = cabecera(req, 'x-sucursal-id');
    if (!sucursalId || !UUID.test(sucursalId)) throw rechazar(ctx, { estado: 400, cuerpo: { codigo: 'SIN_SUCURSAL' }, motivo: 'sin_sucursal', usuarioId });
    const unidadId = cabecera(req, 'x-unidad-id');
    if (unidadId !== undefined && !UUID.test(unidadId)) {
      throw rechazar(ctx, { estado: 400, cuerpo: { codigo: 'UNIDAD_INVALIDA' }, motivo: 'unidad_invalida', usuarioId });
    }

    let permisos: string[];
    try {
      ({ permisos } = await this.resolver.ejecutar({ usuarioId, tenantId, sucursalId, unidadId }));
    } catch (e) {
      if (e instanceof SucursalNoAsignadaError) throw rechazar(ctx, { estado: 403, cuerpo: { codigo: e.code }, motivo: 'sucursal', usuarioId });
      throw e;
    }

    const enTenant = <T>(fn: () => Promise<T>) => this.contexto.run({ tenantId, branchId: sucursalId }, () => this.uow.run(fn));
    if (!permisos.includes(permiso)) {
      await enTenant(() => this.bitacora.registrar('ACCESO_DENEGADO', usuarioId, { permiso, ruta: req.path, metodo: req.method, sucursal_id: sucursalId })).catch(
        (e: unknown) => this.logger.warn({ evento: 'seg.acceso_denegado.error', error: e instanceof Error ? e.name : typeof e }),
      );
      throw rechazar(ctx, { estado: 403, cuerpo: { codigo: 'SIN_PERMISO', permiso }, motivo: 'sin_permiso', usuarioId });
    }
    // Step-up después de comprobar el permiso: pedir MFA a quien igual recibiría 403 no sirve.
    if (!mfaVigente(principal, new Date(), this.maxEdadSeg) && (await enTenant(() => this.catalogo.sensible(permiso)))) {
      throw rechazar(ctx, rechazoMfa(principal, this.maxEdadSeg));
    }

    req.contexto = { tenantId, sucursalId, unidadId: unidadId ?? null, permisos };
    return true;
  }
}
