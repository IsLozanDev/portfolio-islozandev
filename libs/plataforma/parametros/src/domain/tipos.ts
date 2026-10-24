import { AmbitoValorInvalidoError } from './errores.js';

export const TIPOS_PARAMETRO = ['TEXTO', 'NUMERO', 'BOOLEANO', 'JSON'] as const;
export type TipoParametro = (typeof TIPOS_PARAMETRO)[number];

/** Sin UNIDAD: un parámetro se configura como máximo por sucursal. */
export const ALCANCES_PARAMETRO = ['TENANT', 'EMPRESA', 'SUCURSAL'] as const;
export type AlcanceParametro = (typeof ALCANCES_PARAMETRO)[number];
export type OrigenValor = AlcanceParametro | 'DEFECTO';

/** Más alto = más general. */
export const RANGO_ALCANCE: Record<AlcanceParametro, number> = { TENANT: 3, EMPRESA: 2, SUCURSAL: 1 };

/** La sucursal no lleva empresa: se deriva de org.sucursal al resolver. */
export interface AmbitoValor {
  alcance: AlcanceParametro;
  empresaId: string | null;
  sucursalId: string | null;
}

export function ambitoValor(alcance: AlcanceParametro, empresaId: string | null = null, sucursalId: string | null = null): AmbitoValor {
  const coherente =
    (alcance === 'TENANT' && empresaId === null && sucursalId === null) ||
    (alcance === 'EMPRESA' && empresaId !== null && sucursalId === null) ||
    (alcance === 'SUCURSAL' && empresaId === null && sucursalId !== null);
  if (!coherente) throw new AmbitoValorInvalidoError(alcance);
  return { alcance, empresaId, sucursalId };
}
