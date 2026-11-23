import type { TonoEstado } from '@vitrina/shared/ui';
import type { Coincidencia } from './busqueda';
import type { EstadoConsentimiento } from './consentimiento';

export const TONO_ROL: TonoEstado = 'info';

export const TONOS_COINCIDENCIA: Record<Coincidencia, TonoEstado> = { DOCUMENTO: 'neutro', CONTACTO: 'neutro', NOMBRE: 'neutro' };

export const TONOS_ESTADO_CONSENTIMIENTO: Record<EstadoConsentimiento, TonoEstado> = {
  ACEPTA: 'exito',
  RECHAZA: 'neutro',
  REVOCADO: 'advertencia',
};
