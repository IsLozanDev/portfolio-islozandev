import {
  applyDecorators,
  Inject,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import { UNIT_OF_WORK } from '@vitrina/plataforma/kernel-infra';
import { catchError, from, lastValueFrom, type Observable } from 'rxjs';
import { AUDITORIA, type AuditoriaPort } from '../application/ports/auditoria.port.js';
import { AuditoriaNoDisponibleError } from '../domain/errores.js';

export interface OpcionesAuditable {
  /** Formato producto.recurso.accion. */
  accion: string;
  entidadTipo: string;
  /** Parámetro de la ruta con el id de la entidad. */
  parametroId: string;
  /** Claves de la respuesta que se enmascaran además de CAMPOS_ENMASCARADOS. */
  enmascarar?: readonly string[];
}

const METADATO_AUDITABLE = 'aud:auditable';

interface SolicitudAuditable {
  params: Record<string, string | undefined>;
  body?: { motivo?: unknown };
}

/**
 * Audita la ruta en la misma transacción que su caso de uso: `despues` es la respuesta y `motivo` el
 * `motivo` del cuerpo. Sin `antes`: el caso de uso que lo necesite llama a `AuditoriaPort.registrar`.
 */
export const Auditable = (opciones: OpcionesAuditable) =>
  applyDecorators(SetMetadata(METADATO_AUDITABLE, opciones), UseInterceptors(AuditableInterceptor));

/**
 * Corre dentro de ContextoTenantInterceptor (global): el TenantContext ya es el de la petición. Abre la
 * transacción alrededor del handler, que la reutiliza; si el handler lanza, no registra y todo se revierte.
 */
@Injectable()
export class AuditableInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(UNIT_OF_WORK) private readonly unidadDeTrabajo: UnitOfWork,
    @Inject(AUDITORIA) private readonly auditoria: AuditoriaPort,
  ) {}

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const opciones = this.reflector.get<OpcionesAuditable>(METADATO_AUDITABLE, contexto.getHandler());
    const solicitud = contexto.switchToHttp().getRequest<SolicitudAuditable>();
    // siguiente.handle() dentro de run: el handler corre en la transacción abierta aquí.
    const ejecucion = this.unidadDeTrabajo.run(async () => {
      const respuesta = await lastValueFrom(siguiente.handle(), { defaultValue: undefined });
      await this.auditoria.registrar({
        accion: opciones.accion,
        entidadTipo: opciones.entidadTipo,
        entidadId: solicitud.params[opciones.parametroId] ?? '',
        despues: respuesta,
        motivo: motivoDelCuerpo(solicitud),
        enmascarar: opciones.enmascarar,
      });
      return respuesta;
    });
    return from(ejecucion).pipe(catchError(responderNoDisponible));
  }
}

function motivoDelCuerpo({ body }: SolicitudAuditable): string | undefined {
  return typeof body?.motivo === 'string' ? body.motivo : undefined;
}

/** HTTP 503 con el mismo cuerpo `{ codigo, mensaje }` que el 18b. La transacción ya se revirtió. */
function responderNoDisponible(error: unknown): never {
  if (error instanceof AuditoriaNoDisponibleError) {
    throw new ServiceUnavailableException({ codigo: error.code, mensaje: error.message });
  }
  throw error;
}
