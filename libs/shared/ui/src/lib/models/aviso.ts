export type TipoAviso = 'info' | 'exito' | 'advertencia' | 'error';

export interface OpcionesConfirmacion {
  titulo: string;
  texto?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
}

export interface OpcionesConfirmacionDestructiva extends OpcionesConfirmacion {
  pedirMotivo?: boolean;
  /** Mínimo del motivo tras recortar espacios; por defecto `LONGITUD_MINIMA_MOTIVO`. */
  longitudMinimaMotivo?: number;
}

export type ResultadoConfirmacionDestructiva = { confirmado: false } | { confirmado: true; motivo: string | null };
