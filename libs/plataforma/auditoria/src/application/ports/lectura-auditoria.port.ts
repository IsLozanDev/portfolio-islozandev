import type { Finalidad } from '../../domain/entradas.js';
import type { FiltroAuditoria, Paginacion, TipoEventoAuditoria } from '../../domain/filtro-auditoria.js';
import type { OrigenAuditoria } from './registro-auditoria.port.js';

/** Lo que el actor puede leer: sin alcance TENANT, solo la sucursal de X-Sucursal-Id (TR-CA-214). */
export interface AlcanceLectura {
  sucursalForzada?: string;
}

/** El filtro validado, con el alcance y los ids de usuario que coinciden con el texto de `usuario`. */
export interface FiltroResuelto extends Omit<FiltroAuditoria, 'usuario'>, AlcanceLectura {
  usuarioIds?: readonly string[];
}

/** Una fila de la lista: sin `antes` ni `despues`. `numero` es bigint como texto. */
export interface EventoAuditoriaResumen {
  id: string;
  numero: string;
  tipo: TipoEventoAuditoria;
  origen: OrigenAuditoria;
  accion: string;
  entidadTipo: string;
  entidadId: string;
  usuarioId: string | null;
  sucursalId: string | null;
  motivo: string | null;
  finalidad: Finalidad | null;
  ticket: string | null;
  personaTitularId: string | null;
  ip: string | null;
  ocurridoEn: Date;
}

export interface EventoAuditoriaCompleto extends EventoAuditoriaResumen {
  antes: unknown;
  despues: unknown;
  traceId: string | null;
  eventId: string | null;
  hashAnterior: string;
  hash: string;
}

/** aud.evento_auditoria del tenant del contexto, dentro de UnitOfWork.run. */
export interface LecturaAuditoria {
  /** Por ocurrido_en DESC, numero DESC. */
  listar(filtro: FiltroResuelto, paginacion: Paginacion): Promise<{ items: EventoAuditoriaResumen[]; total: number }>;
  /** null si no existe en el tenant o queda fuera del alcance. */
  buscar(id: string, alcance: AlcanceLectura): Promise<EventoAuditoriaCompleto | null>;
  contar(filtro: FiltroResuelto): Promise<number>;
  /** Todas las filas del filtro en lotes de 1 000, por keyset (ocurrido_en DESC, id DESC): memoria acotada sin offset. */
  recorrer(filtro: FiltroResuelto, alLote: (eventos: EventoAuditoriaCompleto[]) => Promise<void>): Promise<void>;
}
