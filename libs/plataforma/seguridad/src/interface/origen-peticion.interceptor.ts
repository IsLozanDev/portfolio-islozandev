import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, type Observable } from 'rxjs';
import type { OrigenPeticion } from '../infrastructure/origen-peticion.js';

interface SolicitudConIp {
  ip?: string;
}

/** Corre el handler con la IP de la petición, la misma que da `@Ip()`, para que la bitácora la guarde. */
export class OrigenPeticionInterceptor implements NestInterceptor {
  constructor(private readonly origen: OrigenPeticion) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { ip } = ctx.switchToHttp().getRequest<SolicitudConIp>();
    // next.handle() dentro de run: Nest liga el handler al contexto asíncrono donde se llama.
    return from(this.origen.ejecutarCon(ip || null, () => lastValueFrom(next.handle(), { defaultValue: undefined })));
  }
}
