export interface TramoCoincidencia {
  inicio: number;
  fin: number;
}

export interface ResultadoBusquedaMenu {
  codigo: string;
  nombre: string;
  ruta: string;
  /** El del nodo de primer nivel que lo contiene. */
  icono: string;
  /** Nombres de los grupos que lo contienen, de afuera hacia adentro. */
  grupos: string[];
  /** Tramo de `nombre` que coincide; `null` si coincidió por el nombre de un grupo. */
  coincidencia: TramoCoincidencia | null;
}
