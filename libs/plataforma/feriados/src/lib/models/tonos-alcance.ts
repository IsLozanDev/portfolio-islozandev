import type { TonoEstado } from '@vitrina/shared/ui';
import type { AlcanceFeriado } from './feriado';

export const TONOS_ALCANCE_FERIADO: Readonly<Record<AlcanceFeriado, TonoEstado>> = {
  GLOBAL: 'info',
  TENANT: 'exito',
  SUCURSAL: 'neutro',
};
