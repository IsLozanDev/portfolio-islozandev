import type { TonoEstado } from '@vitrina/shared/ui';
import type { Coincidencia } from './busqueda';
import type { EstadoConsentimiento } from './consentimiento';

export const TONO_ROL: TonoEstado = 'info';

/** Puntajes de los motivos del spec 39 (100, 80 y 60). */
export const TONOS_PUNTAJE: Readonly<Record<number, TonoEstado>> = { 100: 'advertencia', 80: 'advertencia', 60: 'info' };

export const TONO_DESCARTADO: TonoEstado = 'neutro';

export const TONOS_COINCIDENCIA: Record<Coincidencia, TonoEstado> = { DOCUMENTO: 'neutro', CONTACTO: 'neutro', NOMBRE: 'neutro' };

export const TONOS_ESTADO_CONSENTIMIENTO: Record<EstadoConsentimiento, TonoEstado> = {
  ACEPTA: 'exito',
  RECHAZA: 'neutro',
  REVOCADO: 'advertencia',
};
