import type { Clock, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import type { FilaAuditoria, RegistroAuditoria } from './ports/registro-auditoria.port.js';

export interface DependenciasRegistro {
  contexto: TenantContext;
  ids: IdGenerator;
  reloj: Clock;
  registro: RegistroAuditoria;
}

type DatosDelContexto = Pick<FilaAuditoria, 'id' | 'tenantId' | 'origen' | 'usuarioId' | 'sucursalId' | 'ip' | 'traceId' | 'ocurridoEn'>;

/** Quién, dónde y cuándo de un registro directo: del contexto de la petición (TR-RNF-013). */
export function datosDelContexto({ contexto, ids, reloj }: DependenciasRegistro): DatosDelContexto {
  const { tenantId, branchId, actorId, ip, traceId } = contexto.current();
  return { id: ids.next(), tenantId, origen: 'DIRECTO', usuarioId: actorId, sucursalId: branchId, ip, traceId, ocurridoEn: reloj.now() };
}
