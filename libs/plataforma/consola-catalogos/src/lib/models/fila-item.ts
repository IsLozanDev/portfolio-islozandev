import type { AtributosItem, EstadoItem } from '@vitrina/plataforma/catalogos-ui';

/** Un ítem global de la pestaña «Ítems», con su estado de hoy en Lima. */
export interface FilaItem {
  itemId: string;
  codigo: string;
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: AtributosItem;
  vigenteDesde: string;
  vigenteHasta: string | null;
  activo: boolean;
  estado: EstadoItem;
  version: number;
}

/** `ItemAdministracionDto` de `GET .../items/administracion` (19c). El ajuste del tenant no aplica a la consola. */
export interface FilaItemRespuesta {
  item_id: string;
  codigo: string;
  codigo_externo: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: Record<string, unknown>;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  propio: boolean;
  estado: EstadoItem;
  version: number;
}

export interface PaginaItemsRespuesta {
  items: FilaItemRespuesta[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface PaginaItems {
  items: FilaItem[];
  total: number;
}

/** La consola pide siempre `origen=GLOBAL`: los propios del tenant operador se gestionan en admin. */
export interface FiltroItems {
  texto?: string;
  estado?: EstadoItem;
  pagina: number;
  tamano: number;
}

export const ORIGEN_GLOBAL = 'GLOBAL';

export function aFilaItem(respuesta: FilaItemRespuesta): FilaItem {
  return {
    itemId: respuesta.item_id,
    codigo: respuesta.codigo,
    codigoExterno: respuesta.codigo_externo,
    nombre: respuesta.nombre,
    abreviatura: respuesta.abreviatura,
    orden: respuesta.orden,
    atributos: respuesta.atributos,
    vigenteDesde: respuesta.vigente_desde,
    vigenteHasta: respuesta.vigente_hasta,
    activo: respuesta.activo,
    estado: respuesta.estado,
    version: respuesta.version,
  };
}
