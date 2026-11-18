import type { TonoEstado } from '@vitrina/shared/ui';
import type { EstadoCuota } from './cuota';

export const TONOS_ESTADO_CUOTA: Readonly<Record<EstadoCuota, TonoEstado>> = {
  AGOTADA: 'error',
  EN_AVISO: 'advertencia',
  NORMAL: 'exito',
};

export const TONOS_PROVEEDOR: Readonly<Record<'activo' | 'inactivo', TonoEstado>> = {
  activo: 'exito',
  inactivo: 'neutro',
};
