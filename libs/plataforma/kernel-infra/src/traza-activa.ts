import { isSpanContextValid, trace } from '@opentelemetry/api';
import type { TenantScope } from '@vitrina/plataforma/kernel';

/** Trace id del span activo de OpenTelemetry. Sin SDK registrado (local, pruebas) no hay span y devuelve undefined. */
export function traceIdActivo(): string | undefined {
  const contextoSpan = trace.getActiveSpan()?.spanContext();
  return contextoSpan && isSpanContextValid(contextoSpan) ? contextoSpan.traceId : undefined;
}

/** Solo identificadores (TR-RNF-026): nunca correo ni nombre en atributos del span. */
export function anotarSpanActivo(alcance: TenantScope): void {
  trace.getActiveSpan()?.setAttributes({
    'tenant.id': alcance.tenantId,
    ...(alcance.branchId ? { 'sucursal.id': alcance.branchId } : {}),
    ...(alcance.actorId ? { 'usuario.id': alcance.actorId } : {}),
  });
}
