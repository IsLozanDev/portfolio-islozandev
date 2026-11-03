import type { NodoMenu } from '../models/nodo-menu';
import type { ResultadoBusquedaMenu, TramoCoincidencia } from '../models/resultado-busqueda-menu';

const MARCAS_COMBINANTES = /\p{M}/gu;
const INICIO_CONSULTA_O_FRAGMENTO = /[?#]/;

interface Ancestros {
  icono: string;
  grupos: string[];
  coincideGrupo: boolean;
}

/**
 * Quita tildes y pasa a minúsculas. En texto NFC cada carácter queda en uno solo, así que los
 * índices sobre el texto normalizado valen para el original.
 */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(MARCAS_COMBINANTES, '').toLowerCase();
}

/** Nodos con ruta cuyo nombre, o el de un grupo que los contiene, incluye la consulta. Conserva el orden del árbol. */
export function buscarEnMenu(arbol: readonly NodoMenu[], consulta: string): ResultadoBusquedaMenu[] {
  const consultaNormalizada = normalizarTexto(consulta.trim());
  if (!consultaNormalizada) return [];
  return arbol.flatMap((nodo) =>
    buscarEnNodo(nodo, consultaNormalizada, { icono: nodo.icono, grupos: [], coincideGrupo: false }),
  );
}

function buscarEnNodo(nodo: NodoMenu, consulta: string, ancestros: Ancestros): ResultadoBusquedaMenu[] {
  const nombre = nodo.nombre.normalize('NFC');
  const coincidencia = buscarTramo(nombre, consulta);
  if (nodo.ruta !== null) {
    if (!coincidencia && !ancestros.coincideGrupo) return [];
    return [{ codigo: nodo.codigo, nombre, ruta: nodo.ruta, icono: ancestros.icono, grupos: ancestros.grupos, coincidencia }];
  }
  const ancestrosDeHijos: Ancestros = {
    icono: ancestros.icono,
    grupos: [...ancestros.grupos, nombre],
    coincideGrupo: ancestros.coincideGrupo || coincidencia !== null,
  };
  return nodo.hijos.flatMap((hijo) => buscarEnNodo(hijo, consulta, ancestrosDeHijos));
}

function buscarTramo(nombre: string, consulta: string): TramoCoincidencia | null {
  const inicio = normalizarTexto(nombre).indexOf(consulta);
  if (inicio < 0) return null;
  return { inicio, fin: inicio + consulta.length };
}

const RUTA_RAIZ = '/';

/** La raíz solo está activa en sí misma; el resto también en sus subrutas. */
export function esRutaExacta(ruta: string | null): boolean {
  return ruta === RUTA_RAIZ;
}

/** Códigos de los grupos que contienen el nodo activo en `url`, con la regla de `esRutaExacta`. */
export function gruposDeRuta(arbol: readonly NodoMenu[], url: string): ReadonlySet<string> {
  const ruta = url.split(INICIO_CONSULTA_O_FRAGMENTO)[0];
  return new Set(arbol.flatMap((nodo) => ancestrosDelActivo(nodo, ruta, [])));
}

function ancestrosDelActivo(nodo: NodoMenu, ruta: string, ancestros: string[]): string[] {
  if (nodo.ruta !== null) return estaActiva(nodo.ruta, ruta) ? ancestros : [];
  return nodo.hijos.flatMap((hijo) => ancestrosDelActivo(hijo, ruta, [...ancestros, nodo.codigo]));
}

function estaActiva(rutaNodo: string, ruta: string): boolean {
  if (esRutaExacta(rutaNodo)) return ruta === rutaNodo;
  return ruta === rutaNodo || ruta.startsWith(`${rutaNodo}/`);
}
