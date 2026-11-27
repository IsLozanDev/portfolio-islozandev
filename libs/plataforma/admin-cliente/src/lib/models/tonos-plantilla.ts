import type { TonoEstado } from '@vitrina/shared/ui';
import type { OrigenPlantilla } from './plantilla';

/** Personalizar no es un estado bueno ni malo: `info`, no `exito`. */
export const TONOS_ORIGEN_PLANTILLA: Readonly<Record<OrigenPlantilla, TonoEstado>> = {
  BASE: 'neutro',
  PERSONALIZADA: 'info',
};
