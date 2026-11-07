import type { ContenidoItem } from '../domain/item-catalogo.js';
import { Vigencia } from '../domain/vigencia.js';

/** Campos de un ítem que llegan en el cuerpo al crear o actualizar, globales o propios. */
export interface ContenidoItemComando {
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: unknown;
  /** YYYY-MM-DD. */
  vigenteDesde: string;
  vigenteHasta: string | null;
  activo: boolean;
}

export function contenidoDe(comando: ContenidoItemComando): ContenidoItem {
  return {
    codigoExterno: comando.codigoExterno,
    nombre: comando.nombre,
    abreviatura: comando.abreviatura,
    orden: comando.orden,
    atributos: comando.atributos,
    vigencia: Vigencia.de(comando.vigenteDesde, comando.vigenteHasta),
    activo: comando.activo,
  };
}
