export const ALCANCES_FERIADO = ['GLOBAL', 'TENANT', 'SUCURSAL'] as const;
export type AlcanceFeriado = (typeof ALCANCES_FERIADO)[number];

/** Tope de `n` en `sumarDiasHabiles`. */
export const DIAS_HABILES_MAXIMOS = 366;
