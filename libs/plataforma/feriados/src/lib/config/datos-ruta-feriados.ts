import type { Data } from '@angular/router';
import { ALCANCES_FERIADO, type AlcanceFeriado } from '../models/feriado';

/**
 * Clave de `data` donde la app dice qué alcances gestiona su página de feriados:
 * la consola `['GLOBAL']`, admin `['TENANT', 'SUCURSAL']`. La ruta de la app la hereda a la página.
 */
export const CLAVE_ALCANCES = 'alcances';

export const ALCANCE_GLOBAL: AlcanceFeriado = 'GLOBAL';

/** Los alcances de `data`; un valor que no es un alcance se ignora. */
export function alcancesDeRuta(datos: Data): readonly AlcanceFeriado[] {
  const valor: unknown = datos[CLAVE_ALCANCES];
  if (!Array.isArray(valor)) return [];
  return ALCANCES_FERIADO.filter((alcance) => valor.includes(alcance));
}

/** La consola solo gestiona globales: sin filtros y con el alcance fijo. */
export function esModoGlobal(alcances: readonly AlcanceFeriado[]): boolean {
  return alcances.includes(ALCANCE_GLOBAL);
}
