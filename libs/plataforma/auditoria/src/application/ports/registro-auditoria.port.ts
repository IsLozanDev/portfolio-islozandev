import type { Finalidad } from '../../domain/entradas.js';

export type TipoAuditoria = 'OPERACION' | 'ACCESO_SENSIBLE';
export type OrigenAuditoria = 'DIRECTO' | 'EVENTO';

/** Una fila de aud.evento_auditoria sin numero, hash_anterior ni hash: los pone el trigger. Lo opcional queda NULL. */
export interface FilaAuditoria {
  id: string;
  tenantId: string;
  tipo: TipoAuditoria;
  origen: OrigenAuditoria;
  eventId?: string;
  accion: string;
  entidadTipo: string;
  entidadId: string;
  usuarioId?: string;
  sucursalId?: string;
  antes?: unknown;
  despues?: unknown;
  motivo?: string;
  personaTitularId?: string;
  finalidad?: Finalidad;
  ticket?: string;
  ip?: string;
  traceId?: string;
  ocurridoEn: Date;
}

export interface RegistroAuditoria {
  /** En la transacción activa. Si falla, lanza AuditoriaNoDisponibleError y la operación no se confirma. */
  insertar(fila: FilaAuditoria): Promise<void>;
}
