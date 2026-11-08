import type { AtributosItem } from './atributos';

export const ESTADOS_ITEM = ['VISIBLE', 'INACTIVO', 'FUERA_DE_VIGENCIA', 'OCULTO'] as const;
export type EstadoItem = (typeof ESTADOS_ITEM)[number];

/** Un ítem global o propio, con su versión para el bloqueo optimista. Fechas YYYY-MM-DD. */
export interface ItemCatalogo {
  id: string;
  codigo: string;
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number | null;
  atributos: AtributosItem;
  vigenteDesde: string;
  vigenteHasta: string | null;
  activo: boolean;
  version: number;
}

/** `ItemDto` de la API (19a). */
export interface ItemCatalogoRespuesta {
  id: string;
  codigo: string;
  codigo_externo: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number | null;
  atributos: Record<string, unknown>;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  version: number;
}

/** Lo que emite el formulario de ítem. `codigo` solo al crear: no cambia después. */
export interface SolicitudItem {
  codigo?: string;
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number | null;
  atributos: AtributosItem;
  vigenteDesde: string;
  vigenteHasta: string | null;
  activo: boolean;
}

export type CuerpoItem = Record<string, unknown>;

export function aItemCatalogo(respuesta: ItemCatalogoRespuesta): ItemCatalogo {
  return {
    id: respuesta.id,
    codigo: respuesta.codigo,
    codigoExterno: respuesta.codigo_externo,
    nombre: respuesta.nombre,
    abreviatura: respuesta.abreviatura,
    orden: respuesta.orden,
    atributos: respuesta.atributos,
    vigenteDesde: respuesta.vigente_desde,
    vigenteHasta: respuesta.vigente_hasta,
    activo: respuesta.activo,
    version: respuesta.version,
  };
}

/** Cuerpo snake_case de POST y PUT. Sin `orden`, la API usa su valor por defecto. */
export function aCuerpoItem(solicitud: SolicitudItem): CuerpoItem {
  return {
    ...(solicitud.codigo === undefined ? {} : { codigo: solicitud.codigo }),
    codigo_externo: solicitud.codigoExterno,
    nombre: solicitud.nombre,
    abreviatura: solicitud.abreviatura,
    ...(solicitud.orden === null ? {} : { orden: solicitud.orden }),
    atributos: solicitud.atributos,
    vigente_desde: solicitud.vigenteDesde,
    vigente_hasta: solicitud.vigenteHasta,
    activo: solicitud.activo,
  };
}

/** Un ítem leído como solicitud completa: el PUT reemplaza todo el contenido. */
export function solicitudDeItem(item: ItemCatalogo): SolicitudItem {
  return {
    codigoExterno: item.codigoExterno,
    nombre: item.nombre,
    abreviatura: item.abreviatura,
    orden: item.orden,
    atributos: item.atributos,
    vigenteDesde: item.vigenteDesde,
    vigenteHasta: item.vigenteHasta,
    activo: item.activo,
  };
}
