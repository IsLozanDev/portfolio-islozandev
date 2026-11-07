import { ItemInvalidoError } from './errores.js';
import { ZONA_CATALOGOS } from './tipos.js';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Rango de fechas `YYYY-MM-DD`, inclusivo en ambos extremos. Sin fin: vigente desde el inicio en adelante. */
export class Vigencia {
  private constructor(
    readonly desde: string,
    readonly hasta: string | null,
  ) {}

  static de(desde: string, hasta: string | null): Vigencia {
    if (!esFecha(desde)) throw new ItemInvalidoError('La vigencia inicial no es una fecha válida');
    if (hasta !== null && !esFecha(hasta)) throw new ItemInvalidoError('La vigencia final no es una fecha válida');
    if (hasta !== null && hasta < desde) {
      throw new ItemInvalidoError('La vigencia final no puede ser anterior a la inicial');
    }
    return new Vigencia(desde, hasta);
  }

  /** Las fechas ISO se comparan como texto. */
  incluye(fecha: string): boolean {
    return fecha >= this.desde && (this.hasta === null || fecha <= this.hasta);
  }

  igualA(otra: Vigencia): boolean {
    return this.desde === otra.desde && this.hasta === otra.hasta;
  }
}

/** Formato y fecha real: 2026-02-30 no pasa. */
function esFecha(valor: string): boolean {
  if (!FORMATO_FECHA.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor);
}

// en-CA formatea como YYYY-MM-DD.
const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_CATALOGOS, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Día de vigencia de un instante: el mismo para todos los tenants, en America/Lima. */
export function fechaDeVigencia(instante: Date): string {
  return FORMATO_DIA.format(instante);
}
