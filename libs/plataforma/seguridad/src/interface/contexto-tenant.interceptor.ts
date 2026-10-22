import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import { from, lastValueFrom, type Observable } from 'rxjs';
import type { SolicitudAutenticada } from './decoradores.js';

/**
 * Corre el handler en `TenantContext.run` con el tenant del token. La sucursal solo entra si
 * PermisoGuard la verificó: el `X-Sucursal-Id` de una ruta sin `@Permiso` no se usa.
 */
export class ContextoTenantInterceptor implements NestInterceptor {
  constructor(private readonly contexto: TenantContext) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { principal, contexto } = ctx.switchToHttp().getRequest<SolicitudAutenticada>();
    const tenantId = principal?.tenantId;
    if (!tenantId) return next.handle();
    const alcance = contexto ? { tenantId, branchId: contexto.sucursalId } : { tenantId };
    // next.handle() dentro de run: Nest liga el handler al contexto asíncrono donde se llama.
    return from(this.contexto.run(alcance, () => lastValueFrom(next.handle(), { defaultValue: undefined })));
  }
}
