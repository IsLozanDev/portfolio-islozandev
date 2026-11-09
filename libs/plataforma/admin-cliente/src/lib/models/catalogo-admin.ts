import type { EstadoItem } from '@vitrina/plataforma/catalogos-ui';

export const ALCANCES_CATALOGO = ['GLOBAL', 'MIXTO', 'TENANT'] as const;
export type AlcanceCatalogo = (typeof ALCANCES_CATALOGO)[number];

export const ORIGENES_ITEM = ['GLOBAL', 'PROPIO'] as const;
export type OrigenItem = (typeof ORIGENES_ITEM)[number];

/** Un catálogo como lo ve el tenant: GLOBAL se consulta; MIXTO admite ajustes y propios; TENANT, solo propios (TR-RN-012). */
export interface CatalogoAdmin {
  codigo: string;
  nombre: string;
  alcance: AlcanceCatalogo;
}

/** `CatalogoDto` de `GET /v1/catalogos`; admin solo usa estos campos. */
export interface CatalogoAdminRespuesta {
  codigo: string;
  nombre: string;
  alcance: AlcanceCatalogo;
}

/** Ajuste del tenant sobre un ítem global (TR-RF-025). */
export interface AjusteItem {
  visible: boolean;
  orden: number | null;
  alias: string | null;
  version: number;
}

/** Un ítem global o propio con su estado de hoy y el ajuste del tenant. */
export interface FilaItemAdmin {
  itemId: string;
  codigo: string;
  nombre: string;
  orden: number | null;
  vigenteDesde: string;
  vigenteHasta: string | null;
  propio: boolean;
  estado: EstadoItem;
  ajuste: AjusteItem | null;
  version: number;
}

/** `ItemAdministracionDto` de `GET .../items/administracion` (19c). */
export interface FilaItemAdminRespuesta {
  item_id: string;
  codigo: string;
  nombre: string;
  orden: number | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  propio: boolean;
  estado: EstadoItem;
  ajuste: AjusteItem | null;
  version: number;
}

export interface PaginaItemsAdminRespuesta {
  items: FilaItemAdminRespuesta[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface PaginaItemsAdmin {
  items: FilaItemAdmin[];
  total: number;
}

export interface FiltroItemsAdmin {
  texto?: string;
  estado?: EstadoItem;
  origen?: OrigenItem;
  pagina: number;
  tamano: number;
}

/** `PUT .../ajuste`. Un ajuste neutro (visible, sin orden ni alias) borra la fila. `version` null si no hay ajuste. */
export interface SolicitudAjuste {
  visible: boolean;
  orden: number | null;
  alias: string | null;
  version: number | null;
}

export interface AjusteAplicadoRespuesta {
  cambiado: boolean;
}

export function aCatalogoAdmin(respuesta: CatalogoAdminRespuesta): CatalogoAdmin {
  return { codigo: respuesta.codigo, nombre: respuesta.nombre, alcance: respuesta.alcance };
}

export function aFilaItemAdmin(respuesta: FilaItemAdminRespuesta): FilaItemAdmin {
  return {
    itemId: respuesta.item_id,
    codigo: respuesta.codigo,
    nombre: respuesta.nombre,
    orden: respuesta.orden,
    vigenteDesde: respuesta.vigente_desde,
    vigenteHasta: respuesta.vigente_hasta,
    propio: respuesta.propio,
    estado: respuesta.estado,
    ajuste: respuesta.ajuste,
    version: respuesta.version,
  };
}

export function aPaginaItemsAdmin(respuesta: PaginaItemsAdminRespuesta): PaginaItemsAdmin {
  return { items: respuesta.items.map(aFilaItemAdmin), total: respuesta.total };
}

/** Query params de `items/administracion`; los filtros vacíos no viajan. */
export function parametrosConsultaItems(filtro: FiltroItemsAdmin): Record<string, string | number> {
  return {
    pagina: filtro.pagina,
    tamano: filtro.tamano,
    ...(filtro.texto ? { texto: filtro.texto } : {}),
    ...(filtro.estado ? { estado: filtro.estado } : {}),
    ...(filtro.origen ? { origen: filtro.origen } : {}),
  };
}

/** El ajuste actual con `visible` cambiado: el interruptor no toca el alias ni el orden (TR-CA-066). */
export function ajusteConVisible(fila: FilaItemAdmin, visible: boolean): SolicitudAjuste {
  return { visible, orden: fila.ajuste?.orden ?? null, alias: fila.ajuste?.alias ?? null, version: fila.ajuste?.version ?? null };
}

/** El ajuste neutro: el back borra la fila y el ítem vuelve a los valores globales. */
export function ajusteNeutro(fila: FilaItemAdmin): SolicitudAjuste {
  return { visible: true, orden: null, alias: null, version: fila.ajuste?.version ?? null };
}

export function aCuerpoAjuste(solicitud: SolicitudAjuste): Record<string, unknown> {
  return { visible: solicitud.visible, orden: solicitud.orden, alias: solicitud.alias, version: solicitud.version };
}
