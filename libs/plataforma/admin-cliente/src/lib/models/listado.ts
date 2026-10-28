/** Página que devuelven las listas de la API (`{ items, total }`). */
export interface Listado<T> {
  items: T[];
  total: number;
}

export function aListado<R, T>(respuesta: Listado<R>, mapear: (fila: R) => T): Listado<T> {
  return { items: respuesta.items.map(mapear), total: respuesta.total };
}
