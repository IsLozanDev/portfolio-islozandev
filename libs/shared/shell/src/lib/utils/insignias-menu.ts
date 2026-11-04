import type { InsigniasMenu } from '../services/insignias-menu.service';
import type { NodoMenu } from '../models/nodo-menu';

/** Una hoja muestra la suya; un grupo, la suma de su subárbol (para verla con el grupo cerrado o en el riel). */
export function insigniaDe(nodo: NodoMenu, insignias: InsigniasMenu): number {
  const propia = insignias[nodo.codigo] ?? 0;
  return nodo.hijos.reduce((suma, hijo) => suma + insigniaDe(hijo, insignias), propia);
}
