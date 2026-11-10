import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { TenantContext, TenantScope } from '@vitrina/plataforma/kernel';
import { traceIdActivo } from '@vitrina/plataforma/kernel-infra';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { ipLegible } from '../infrastructure/origen-peticion.js';
import type { SolicitudAutenticada } from './decoradores.js';
import { traceIdDeTraceparent } from './traza.js';

interface SolicitudConOrigen extends SolicitudAutenticada {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Corre el handler en `TenantContext.run` con el tenant y el usuario del token, la IP y el trace de la
 * petición. La sucursal solo entra si PermisoGuard la verificó: el `X-Sucursal-Id` de una ruta sin
 * `@Permiso` no se usa.
 */
export class ContextoTenantInterceptor implements NestInterceptor {
  constructor(private readonly contexto: TenantContext) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const solicitud = ctx.switchToHttp().getRequest<SolicitudConOrigen>();
    const alcance = alcanceDeSolicitud(solicitud);
    if (!alcance) return next.handle();
    // next.handle() dentro de run: Nest liga el handler al contexto asíncrono donde se llama.
    return from(this.contexto.run(alcance, () => lastValueFrom(next.handle(), { defaultValue: undefined })));
  }
}

function alcanceDeSolicitud({ principal, contexto, ip, headers }: SolicitudConOrigen): TenantScope | null {
  if (!principal?.tenantId) return null;
  const ipCliente = ipLegible(ip || null);
  const traceparent = headers['traceparent'];
  // Con OpenTelemetry activo, el span ya continúa el traceparent o abre uno nuevo; sin SDK queda el encabezado.
  const traceId = traceIdActivo() ?? traceIdDeTraceparent(typeof traceparent === 'string' ? traceparent : undefined);
  return {
    tenantId: principal.tenantId,
    actorId: principal.usuarioId,
    ...(contexto ? { branchId: contexto.sucursalId } : {}),
    ...(ipCliente ? { ip: ipCliente } : {}),
    ...(traceId ? { traceId } : {}),
  };
}
