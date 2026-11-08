import type { Feriado } from '../../domain/feriados/feriado.js';
import type { AlcanceFeriado } from '../../domain/feriados/tipos.js';

export interface FeriadoGuardado {
  id: string;
  alcance: AlcanceFeriado;
  sucursalId: string | null;
  fecha: string;
  nombre: string;
  recurrenteAnual: boolean;
  version: number;
}

/** Un feriado en la lista de un año. `editable` es false en los globales fuera del operador. */
export interface FeriadoDelAnio extends FeriadoGuardado {
  fechaEnAnio: string;
  editable: boolean;
}

/** La versión va aparte: tras escribir, la que quedó en la base no es la que leyó el agregado. */
export function feriadoGuardadoDe(feriado: Feriado, version: number): FeriadoGuardado {
  return {
    id: feriado.id,
    alcance: feriado.alcance,
    sucursalId: feriado.sucursalId,
    fecha: feriado.fecha,
    nombre: feriado.nombre,
    recurrenteAnual: feriado.recurrenteAnual,
    version,
  };
}
