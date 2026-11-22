export const ETAPAS_CARGA = ['ESPERA', 'SUBIENDO', 'CONFIRMANDO', 'ANALIZANDO', 'DISPONIBLE', 'CUARENTENA', 'RECHAZADO', 'ERROR'] as const;

/** Etapa de `vit-archivo-carga`, de la espera al resultado del análisis. */
export type EtapaCarga = (typeof ETAPAS_CARGA)[number];
