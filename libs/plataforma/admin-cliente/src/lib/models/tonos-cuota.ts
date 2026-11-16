import type { TonoEstado } from '@vitrina/shared/ui';
import type { EstadoCuota } from './cuota-actual';

/** Mismo mapa que `consola-identidad` (spec 30): una lib feature no importa de otra. */
export const TONOS_ESTADO_CUOTA: Readonly<Record<EstadoCuota, TonoEstado>> = {
  AGOTADA: 'error',
  EN_AVISO: 'advertencia',
  NORMAL: 'exito',
};
