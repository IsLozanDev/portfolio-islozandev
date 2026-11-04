/** Catálogo de `seg.evento_seguridad.tipo` (spec 18). */
export const TIPOS_EVENTO = ['LOGIN', 'ACCESO_DENEGADO', 'ASIGNACION_OTORGADA', 'ASIGNACION_REVOCADA', 'ACCESO_SOPORTE'] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/** Días calendario `YYYY-MM-DD` en hora de Lima, ambos incluidos. */
export interface FiltroBitacora {
  desde: string;
  hasta: string;
  tipo?: TipoEvento;
  /** Parte del correo o del nombre; la API exige 2 caracteres como mínimo. */
  usuario?: string;
  pagina: number;
  tamano: number;
}

export interface UsuarioDelEvento {
  id: string;
  nombre: string;
  correo: string;
}

export interface EventoSeguridadRespuesta {
  id: string;
  tipo: TipoEvento;
  ocurrido_en: string;
  usuario: UsuarioDelEvento | null;
  resumen: string | null;
}

export interface EventoSeguridadDetalleRespuesta extends EventoSeguridadRespuesta {
  ip: string | null;
  detalle: Record<string, unknown>;
}

export interface EventoSeguridad {
  id: string;
  tipo: TipoEvento;
  ocurridoEn: Date;
  usuario: UsuarioDelEvento | null;
  /** Permiso faltante, ticket o alcance, según el tipo (TR-CA-051). */
  resumen: string | null;
}

export interface EventoSeguridadDetalle extends EventoSeguridad {
  ip: string | null;
  detalle: Record<string, unknown>;
}

export function aEventoSeguridad(respuesta: EventoSeguridadRespuesta): EventoSeguridad {
  return {
    id: respuesta.id,
    tipo: respuesta.tipo,
    ocurridoEn: new Date(respuesta.ocurrido_en),
    usuario: respuesta.usuario,
    resumen: respuesta.resumen,
  };
}

export function aEventoSeguridadDetalle(respuesta: EventoSeguridadDetalleRespuesta): EventoSeguridadDetalle {
  return { ...aEventoSeguridad(respuesta), ip: respuesta.ip, detalle: respuesta.detalle };
}
