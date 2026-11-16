import { IncluidasMenorQueConsumidasError, PeriodoCerradoError } from './errores.js';
import { compararPeriodos, type Periodo } from './periodo.js';

export interface AjusteCuota {
  incluidasNuevas: number;
  consumidas: number;
  periodo: Periodo;
  periodoActual: Periodo;
}

/** Un mes cerrado no se toca y las incluidas nunca bajan de lo ya consumido (ck_cuota_tope). */
export function validarAjuste({ incluidasNuevas, consumidas, periodo, periodoActual }: AjusteCuota): void {
  if (compararPeriodos(periodo, periodoActual) < 0) throw new PeriodoCerradoError();
  if (incluidasNuevas < consumidas) throw new IncluidasMenorQueConsumidasError();
}
