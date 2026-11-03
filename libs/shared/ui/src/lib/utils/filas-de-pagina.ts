import type { CambioPagina } from '../models/columna-tabla';

/** Filas de una página cuando la lista ya está entera en el navegador (paginación local). */
export function filasDePagina<Fila>(filas: readonly Fila[], { indice, tamano }: CambioPagina): Fila[] {
  const inicio = indice * tamano;
  return filas.slice(inicio, inicio + tamano);
}
