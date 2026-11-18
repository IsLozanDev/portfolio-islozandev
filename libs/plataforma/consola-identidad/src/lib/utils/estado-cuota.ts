import type { EstadoCuota, FilaCuota } from '../models/cuota';

/** En la consola, «Sobre el umbral» sale del aviso que de verdad se publicó: la lista no trae el umbral del tenant. */
export function estadoDeFila(fila: Pick<FilaCuota, 'incluidas' | 'consumidas' | 'avisadoUmbralEn'>): EstadoCuota {
  if (fila.consumidas >= fila.incluidas) return 'AGOTADA';
  if (fila.avisadoUmbralEn !== null) return 'EN_AVISO';
  return 'NORMAL';
}
