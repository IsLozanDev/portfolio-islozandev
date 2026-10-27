export type TipoAviso = 'info' | 'exito' | 'advertencia' | 'error';

export interface OpcionesConfirmacion {
  titulo: string;
  texto?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
}

export interface OpcionesConfirmacionDestructiva extends OpcionesConfirmacion {
  pedirMotivo?: boolean;
}

export type ResultadoConfirmacionDestructiva = { confirmado: false } | { confirmado: true; motivo: string | null };
