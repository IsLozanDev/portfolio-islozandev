import type { CuotaActual, EstadoCuota } from '../models/cuota-actual';

/** En la tarjeta, «Sobre el umbral» sale del umbral del tenant; en la consola, del aviso publicado (spec 30). */
export function estadoDeCuotaActual(cuota: Pick<CuotaActual, 'incluidas' | 'consumidas' | 'porcentaje' | 'umbralAviso'>): EstadoCuota {
  if (cuota.consumidas >= cuota.incluidas) return 'AGOTADA';
  if (cuota.porcentaje >= cuota.umbralAviso) return 'EN_AVISO';
  return 'NORMAL';
}
