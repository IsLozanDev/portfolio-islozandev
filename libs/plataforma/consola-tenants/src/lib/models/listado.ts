/** Tamaño de página de las listas de la consola (el de la API por defecto). */
export const TAMANO_PAGINA = 20;

/** Página que devuelven las listas de la API (`{ items, total }`). */
export interface Listado<T> {
  items: T[];
  total: number;
}
