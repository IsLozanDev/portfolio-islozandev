import type { TonoEstado } from './tono-estado';

/** `inicio` va antes del título (p. ej. una miniatura) y pinta su plantilla `vitCeldaTabla`. */
export type RolMovil = 'inicio' | 'titulo' | 'detalle' | 'estado';

export interface ColumnaTabla<Fila> {
  clave: keyof Fila & string;
  titulo: string;
  ordenable?: boolean;
  /** Con tono, la celda es un `vit-chip-estado`. */
  tono?: (fila: Fila) => TonoEstado;
  /** Con un nombre de Material Symbols, la celda pinta ese ícono y su valor queda como texto accesible; con null, el valor. */
  icono?: (fila: Fila) => string | null;
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
