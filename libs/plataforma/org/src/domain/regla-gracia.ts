import type { FechaCalendario } from './fecha-calendario.js';
import type { Suscripcion } from './suscripcion.js';

export const MOTIVO_FIN_DE_GRACIA = 'Fin del periodo de gracia de la suscripción';

/**
 * Se suspende solo si ninguna suscripción sigue vigente y la vencida más reciente agotó la gracia.
 * Un producto vencido no apaga a los demás: TR-RN-006 ya le quita sus permisos.
 */
export function debeSuspenderse(suscripciones: readonly Suscripcion[], diasGracia: number, fecha: FechaCalendario): boolean {
  if (suscripciones.some((s) => s.vigente)) return false;
  const diasDesdeVencimiento = suscripciones
    .filter((s) => s.datos.estado === 'VENCIDA')
    .map((s) => s.diasVencida(fecha))
    .filter((dias): dias is number => dias !== null);
  if (diasDesdeVencimiento.length === 0) return false;
  return Math.min(...diasDesdeVencimiento) >= diasGracia;
}
