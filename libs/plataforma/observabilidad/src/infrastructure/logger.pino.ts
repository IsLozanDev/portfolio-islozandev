import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import type { TenantContext, TenantScope } from '@vitrina/plataforma/kernel';
import { rutasRedactadas, valorCensurado } from '../domain/campos-redactados.js';

export interface OpcionesLogger {
  /** `vitrina-api` o `vitrina-worker`; va en cada línea como `servicio`. */
  readonly servicio: string;
  readonly nivel: string;
  readonly salDocumento: string;
  readonly contexto: TenantContext;
}

/** Campos de contexto del log (TR-RNF-026). Solo identificadores, nunca nombres ni correos. */
export interface CamposContexto {
  trace_id?: string;
  tenant_id?: string;
  sucursal_id?: string;
  usuario_id?: string;
}

export function opcionesLogger({ servicio, nivel, salDocumento, contexto }: OpcionesLogger): Options {
  return {
    level: nivel,
    base: { servicio },
    redact: { paths: rutasRedactadas(), censor: (valor, ruta) => valorCensurado(valor, ruta, salDocumento) },
    mixin: () => camposContexto(alcanceActual(contexto)),
    serializers: { req: serializarSolicitud, res: serializarRespuesta },
    customAttributeKeys: { responseTime: 'duracion_ms' },
    // Las líneas que se escriben durante la solicitud llevan solo su id, no la solicitud completa.
    quietReqLogger: true,
  };
}

export function camposContexto(alcance: TenantScope | undefined): CamposContexto {
  if (!alcance) return {};
  return {
    ...(alcance.traceId ? { trace_id: alcance.traceId } : {}),
    tenant_id: alcance.tenantId,
    ...(alcance.branchId ? { sucursal_id: alcance.branchId } : {}),
    ...(alcance.actorId ? { usuario_id: alcance.actorId } : {}),
  };
}

/** Ruta sin query string: la query puede traer correos o documentos. Sin encabezados ni body. */
export function serializarSolicitud(solicitud: IncomingMessage): { metodo?: string; ruta?: string } {
  return { metodo: solicitud.method, ruta: solicitud.url?.split('?')[0] };
}

function serializarRespuesta(respuesta: ServerResponse): { estado: number } {
  return { estado: respuesta.statusCode };
}

// Fuera de una solicitud o tarea con tenant (arranque, relay) no hay alcance, y current() lanza.
function alcanceActual(contexto: TenantContext): TenantScope | undefined {
  try {
    return contexto.current();
  } catch {
    return undefined;
  }
}
