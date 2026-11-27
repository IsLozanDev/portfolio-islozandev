import type { TonoEstado } from '@vitrina/shared/ui';

/** Los mismos que el CHECK de fe.emisor.estado. */
export type EstadoEmisor = 'BORRADOR' | 'CONFIGURADO' | 'VERIFICADO' | 'PRODUCCION';
export type AmbienteEmisor = 'BETA' | 'PRODUCCION';
export type EstadoPrueba = 'EN_PROCESO' | 'ACEPTADA' | 'RECHAZADA' | 'ERROR';

export const TONOS_ESTADO_EMISOR: Record<EstadoEmisor, TonoEstado> = {
  BORRADOR: 'neutro',
  CONFIGURADO: 'info',
  VERIFICADO: 'exito',
  PRODUCCION: 'exito',
};

export const ETIQUETAS_ESTADO_EMISOR: Record<EstadoEmisor, string> = {
  BORRADOR: 'Borrador',
  CONFIGURADO: 'Configurado',
  VERIFICADO: 'Verificado',
  PRODUCCION: 'En producción',
};

/** La empresa aún no configura su emisor. */
export const TONO_SIN_EMISOR: TonoEstado = 'neutro';
export const ETIQUETA_SIN_EMISOR = 'Sin configurar';

export const TONOS_PRUEBA: Record<EstadoPrueba, TonoEstado> = {
  EN_PROCESO: 'info',
  ACEPTADA: 'exito',
  RECHAZADA: 'error',
  ERROR: 'advertencia',
};

export const ETIQUETAS_PRUEBA: Record<EstadoPrueba, string> = {
  EN_PROCESO: 'En proceso',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  ERROR: 'Error',
};

export const ETIQUETAS_AMBIENTE: Record<AmbienteEmisor, string> = {
  BETA: 'Beta',
  PRODUCCION: 'Producción',
};
