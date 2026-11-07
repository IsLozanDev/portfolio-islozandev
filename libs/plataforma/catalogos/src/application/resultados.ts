import type { AtributosItem } from '../domain/atributos-item.js';
import type { Catalogo } from '../domain/catalogo.js';
import type { ItemCatalogo } from '../domain/item-catalogo.js';
import type { AlcanceCatalogo } from '../domain/tipos.js';

export interface DefinicionCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  alcance: AlcanceCatalogo;
  fuente: string | null;
  editablePorTenant: boolean;
  version: number;
}

export interface ItemGuardado {
  id: string;
  codigo: string;
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: AtributosItem;
  vigenteDesde: string;
  vigenteHasta: string | null;
  activo: boolean;
  version: number;
}

/** `cambiado` false: no había nada que cambiar; no se escribió ni se publicó (TR-RNF-008). */
export type Actualizado<T> = T & { cambiado: boolean };

/** La versión va aparte: tras escribir, la que quedó en la base no es la que leyó el agregado. */
export function definicionDe(catalogo: Catalogo, version: number): DefinicionCatalogo {
  return {
    id: catalogo.id,
    codigo: catalogo.codigo,
    nombre: catalogo.nombre,
    alcance: catalogo.alcance,
    fuente: catalogo.fuente,
    editablePorTenant: catalogo.editablePorTenant,
    version,
  };
}

export function itemGuardadoDe(item: ItemCatalogo, version: number): ItemGuardado {
  return {
    id: item.id,
    codigo: item.codigo,
    codigoExterno: item.codigoExterno,
    nombre: item.nombre,
    abreviatura: item.abreviatura,
    orden: item.orden,
    atributos: item.atributos,
    vigenteDesde: item.vigencia.desde,
    vigenteHasta: item.vigencia.hasta,
    activo: item.activo,
    version,
  };
}
