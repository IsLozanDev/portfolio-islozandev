import type { ContextoUsuario } from '@vitrina/shared/auth';
import type { NodoMenu } from '../models/nodo-menu';

type OpcionMenu = ContextoUsuario['menu'][number];
type HijosPorPadre = ReadonlyMap<string | null, readonly OpcionMenu[]>;

export const ICONO_POR_DEFECTO = 'circle';

/**
 * Arma el árbol del menú desde la lista plana de `mi-contexto`. Una opción cuyo padre no vino
 * (sin permiso o fuera del manifiesto) sube a la raíz; un nodo sin hijos ni ruta no se pinta.
 */
export function construirArbolMenu(menu: readonly OpcionMenu[]): NodoMenu[] {
  const codigos = new Set(menu.map((opcion) => opcion.codigo));
  const hijosPorPadre = new Map<string | null, OpcionMenu[]>();
  for (const opcion of menu) {
    const padre = opcion.padre !== null && codigos.has(opcion.padre) ? opcion.padre : null;
    hijosPorPadre.set(padre, [...(hijosPorPadre.get(padre) ?? []), opcion]);
  }
  return construirNivel(null, hijosPorPadre);
}

function construirNivel(padre: string | null, hijosPorPadre: HijosPorPadre): NodoMenu[] {
  return [...(hijosPorPadre.get(padre) ?? [])]
    .sort(compararOpciones)
    .map((opcion) => crearNodo(opcion, construirNivel(opcion.codigo, hijosPorPadre)))
    .filter((nodo) => nodo.hijos.length > 0 || nodo.ruta !== null);
}

function crearNodo(opcion: OpcionMenu, hijos: NodoMenu[]): NodoMenu {
  return {
    codigo: opcion.codigo,
    nombre: opcion.nombre,
    ruta: hijos.length > 0 ? null : opcion.ruta,
    icono: opcion.icono ?? ICONO_POR_DEFECTO,
    hijos,
  };
}

function compararOpciones(una: OpcionMenu, otra: OpcionMenu): number {
  return una.orden - otra.orden || una.nombre.localeCompare(otra.nombre, 'es');
}
