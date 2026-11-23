/** Los mismos que el CHECK de fe.emisor.estado. VERIFICADO y PRODUCCION llegan con el spec 50. */
export const ESTADOS_EMISOR = ['BORRADOR', 'CONFIGURADO', 'VERIFICADO', 'PRODUCCION'] as const;
export type EstadoEmisor = (typeof ESTADOS_EMISOR)[number];

/** Los mismos que el CHECK de fe.emisor.ambiente. */
export const AMBIENTES_EMISOR = ['BETA', 'PRODUCCION'] as const;
export type AmbienteEmisor = (typeof AMBIENTES_EMISOR)[number];

export const AMBIENTE_INICIAL: AmbienteEmisor = 'BETA';
