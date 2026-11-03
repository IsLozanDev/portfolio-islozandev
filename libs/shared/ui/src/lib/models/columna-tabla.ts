import type { TonoEstado } from './tono-estado';

export type RolMovil = 'titulo' | 'detalle' | 'estado';

export interface ColumnaTabla<Fila> {
  clave: keyof Fila & string;
  titulo: string;
  ordenable?: boolean;
  /** Con tono, la celda es un `vit-chip-estado`. */
  tono?: (fila: Fila) => TonoEstado;
  /** Sin movil, la columna no aparece en celular. */
  movil?: RolMovil;
}

export interface CambioPagina {
  indice: number;
  tamano: number;
}

export interface CambioOrden {
  clave: string;
  direccion: 'asc' | 'desc' | '';
}
