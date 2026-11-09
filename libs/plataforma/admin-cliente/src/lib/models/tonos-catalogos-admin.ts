import type { TonoEstado } from '@vitrina/shared/ui';
import type { AlcanceCatalogo, OrigenItem } from './catalogo-admin';

export const TONOS_ALCANCE_CATALOGO: Readonly<Record<AlcanceCatalogo, TonoEstado>> = {
  GLOBAL: 'info',
  MIXTO: 'exito',
  TENANT: 'neutro',
};

export const TONOS_ORIGEN: Readonly<Record<OrigenItem, TonoEstado>> = {
  GLOBAL: 'info',
  PROPIO: 'exito',
};
