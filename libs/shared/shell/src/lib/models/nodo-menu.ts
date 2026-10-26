export interface NodoMenu {
  codigo: string;
  nombre: string;
  /** `null` en los grupos (nodos con hijos): solo se expanden. */
  ruta: string | null;
  /** Nombre de Material Symbols. */
  icono: string;
  hijos: NodoMenu[];
}
