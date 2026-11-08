import type { TonoEstado } from '@vitrina/shared/ui';
import type { AlcanceCatalogo } from './catalogo';
import type { EstadoImportacion } from './importacion';

export const TONOS_ALCANCE: Readonly<Record<AlcanceCatalogo, TonoEstado>> = {
  GLOBAL: 'info',
  MIXTO: 'exito',
  TENANT: 'neutro',
};

export const TONOS_ESTADO_IMPORTACION: Readonly<Record<EstadoImportacion, TonoEstado>> = {
  APLICADA: 'exito',
  EN_COLA: 'info',
  EN_PROCESO: 'info',
  PREVISUALIZADA: 'neutro',
  VENCIDA: 'advertencia',
  OBSOLETA: 'advertencia',
  RECHAZADA: 'error',
  FALLIDA: 'error',
};
