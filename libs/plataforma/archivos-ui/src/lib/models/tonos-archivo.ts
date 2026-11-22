import type { TonoEstado } from '@vitrina/shared/ui';
import type { CodigoEstadoArchivo } from './archivo';

export const TONOS_ESTADO_ARCHIVO: Readonly<Record<CodigoEstadoArchivo, TonoEstado>> = {
  DISPONIBLE: 'exito',
  EN_ANALISIS: 'info',
  PENDIENTE_CARGA: 'info',
  CUARENTENA: 'error',
  RECHAZADO: 'error',
};

export const ETIQUETAS_ESTADO_ARCHIVO: Readonly<Record<CodigoEstadoArchivo, string>> = {
  DISPONIBLE: 'Disponible',
  EN_ANALISIS: 'En análisis',
  PENDIENTE_CARGA: 'Pendiente de carga',
  CUARENTENA: 'En cuarentena',
  RECHAZADO: 'Rechazado',
};
