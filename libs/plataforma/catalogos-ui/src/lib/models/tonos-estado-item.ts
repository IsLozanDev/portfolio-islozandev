import type { TonoEstado } from '@vitrina/shared/ui';
import type { EstadoItem } from './item';

export const TONOS_ESTADO_ITEM: Readonly<Record<EstadoItem, TonoEstado>> = {
  VISIBLE: 'exito',
  INACTIVO: 'neutro',
  FUERA_DE_VIGENCIA: 'advertencia',
  OCULTO: 'info',
};

export const ETIQUETAS_ESTADO_ITEM: Readonly<Record<EstadoItem, string>> = {
  VISIBLE: 'Visible',
  INACTIVO: 'Inactivo',
  FUERA_DE_VIGENCIA: 'Fuera de vigencia',
  OCULTO: 'Oculto',
};
