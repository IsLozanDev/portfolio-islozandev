/** Catálogo de `aud.evento_auditoria.tipo` (specs 20a y 20b). */
export const TIPOS_EVENTO_AUDITORIA = ['OPERACION', 'ACCESO_SENSIBLE'] as const;
export type TipoEventoAuditoria = (typeof TIPOS_EVENTO_AUDITORIA)[number];

export type Finalidad = 'ATENCION' | 'AUDITORIA_MEDICA' | 'SOPORTE' | 'OTRO';

/** Días calendario `YYYY-MM-DD` en hora de Lima, ambos incluidos. */
export interface FiltroAuditoria {
  desde: string;
  hasta: string;
  /** Parte del correo o del nombre de quien actuó; la API exige 2 caracteres como mínimo. */
  usuario?: string;
  /** Exacta, en formato `producto.recurso.accion`. */
  accion?: string;
  tipo?: TipoEventoAuditoria;
  sucursalId?: string;
  entidadTipo?: string;
  entidadId?: string;
  personaTitularId?: string;
  pagina: number;
  tamano: number;
}

export interface UsuarioAuditoria {
  id: string;
  nombre: string;
  correo: string;
}

export interface SucursalAuditoria {
  id: string;
  codigo: string;
  nombre: string;
}

export interface CambioAuditoria {
  campo: string;
  antes: unknown;
  despues: unknown;
}

export interface EventoAuditoriaRespuesta {
  id: string;
  numero: string;
  tipo: TipoEventoAuditoria;
  accion: string;
  entidad_tipo: string;
  entidad_id: string;
  usuario: UsuarioAuditoria | null;
  sucursal: SucursalAuditoria | null;
  motivo: string | null;
  finalidad: Finalidad | null;
  ticket: string | null;
  persona_titular_id: string | null;
  ip: string | null;
  ocurrido_en: string;
}

export interface EventoAuditoriaDetalleRespuesta extends EventoAuditoriaRespuesta {
  antes: unknown;
  despues: unknown;
  cambios: CambioAuditoria[];
  trace_id: string | null;
  event_id: string | null;
  hash_anterior: string;
  hash: string;
}

export interface EventoAuditoria {
  id: string;
  /** Posición en la cadena del tenant; bigint como texto. */
  numero: string;
  tipo: TipoEventoAuditoria;
  accion: string;
  entidadTipo: string;
  entidadId: string;
  /** `null` si actuó el sistema. */
  usuario: UsuarioAuditoria | null;
  /** `null` en operaciones de todo el tenant. */
  sucursal: SucursalAuditoria | null;
  motivo: string | null;
  finalidad: Finalidad | null;
  ticket: string | null;
  personaTitularId: string | null;
  ip: string | null;
  ocurridoEn: Date;
}

export interface EventoAuditoriaDetalle extends EventoAuditoria {
  antes: unknown;
  despues: unknown;
  /** Hasta 200, ordenados por ruta (spec 20b). */
  cambios: CambioAuditoria[];
  traceId: string | null;
  eventId: string | null;
  hashAnterior: string;
  hash: string;
}

export function aEventoAuditoria(respuesta: EventoAuditoriaRespuesta): EventoAuditoria {
  return {
    id: respuesta.id,
    numero: respuesta.numero,
    tipo: respuesta.tipo,
    accion: respuesta.accion,
    entidadTipo: respuesta.entidad_tipo,
    entidadId: respuesta.entidad_id,
    usuario: respuesta.usuario,
    sucursal: respuesta.sucursal,
    motivo: respuesta.motivo,
    finalidad: respuesta.finalidad,
    ticket: respuesta.ticket,
    personaTitularId: respuesta.persona_titular_id,
    ip: respuesta.ip,
    ocurridoEn: new Date(respuesta.ocurrido_en),
  };
}

export function aEventoAuditoriaDetalle(respuesta: EventoAuditoriaDetalleRespuesta): EventoAuditoriaDetalle {
  return {
    ...aEventoAuditoria(respuesta),
    antes: respuesta.antes,
    despues: respuesta.despues,
    cambios: respuesta.cambios,
    traceId: respuesta.trace_id,
    eventId: respuesta.event_id,
    hashAnterior: respuesta.hash_anterior,
    hash: respuesta.hash,
  };
}
