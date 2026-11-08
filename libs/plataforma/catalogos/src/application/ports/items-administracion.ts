import type { AtributosItem } from '../../domain/atributos-item.js';
import type { EstadoItem } from '../../domain/tipos.js';

export const ORIGENES_ITEM = ['GLOBAL', 'PROPIO'] as const;
export type OrigenItem = (typeof ORIGENES_ITEM)[number];

export interface FiltroItemsAdministracion {
  codigo: string;
  tenantId: string;
  /** Día de vigencia `YYYY-MM-DD` con el que se calcula el estado. */
  fecha: string;
  /** Busca en código o nombre, sin distinguir mayúsculas. */
  texto: string | null;
  estado: EstadoItem | null;
  origen: OrigenItem | null;
  limite: number;
  desplazamiento: number;
}

/** El ajuste del tenant sobre un ítem global, como está guardado. */
export interface AjusteAdministrado {
  visible: boolean;
  orden: number | null;
  alias: string | null;
  version: number;
}

/** Ítem con sus datos propios (nombre y orden sin el ajuste), su estado y el ajuste aparte. */
export interface FilaAdministracion {
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
  propio: boolean;
  estado: EstadoItem;
  ajuste: AjusteAdministrado | null;
  version: number;
}

/** `cat.items_administracion`, con la RLS del tenant. */
export interface LecturaItemsAdministracion {
  /** `total`: las filas que cumplen el filtro antes de paginar; 0 si la página no trae filas. */
  listar(filtro: FiltroItemsAdministracion): Promise<{ filas: FilaAdministracion[]; total: number }>;
}
