import type { Reinicio, TipoDocumento } from './tipos.js';

/** Eventos de seq en el outbox, en schema_version 1. Ninguno por número emitido. */
export const EVENTOS_SEQ = {
  serieCreada: 'serie.creada',
  serieEstadoCambiado: 'serie.estado_cambiado',
} as const;

export interface SerieCreada {
  serie_id: string;
  empresa_id: string;
  sucursal_id: string | null;
  unidad_id: string | null;
  tipo: TipoDocumento;
  serie: string;
  digitos: number;
  reinicio: Reinicio;
  ultimo_numero: number;
  por: string;
}

export interface SerieEstadoCambiado {
  serie_id: string;
  tipo: TipoDocumento;
  serie: string;
  activa: boolean;
  por: string;
}
