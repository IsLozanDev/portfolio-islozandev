/** Página que devuelven las listas de la API (`{ items, total }`). */
export interface Listado<T> {
  items: T[];
  total: number;
}
