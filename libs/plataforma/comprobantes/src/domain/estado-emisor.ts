/** Los mismos que el CHECK de fe.emisor.estado. */
export const ESTADOS_EMISOR = ['BORRADOR', 'CONFIGURADO', 'VERIFICADO', 'PRODUCCION'] as const;
export type EstadoEmisor = (typeof ESTADOS_EMISOR)[number];

/** Los mismos que el CHECK de fe.emisor.ambiente. */
export const AMBIENTES_EMISOR = ['BETA', 'PRODUCCION'] as const;
export type AmbienteEmisor = (typeof AMBIENTES_EMISOR)[number];

export const AMBIENTE_INICIAL: AmbienteEmisor = 'BETA';

/** Los mismos que el CHECK de fe.emisor.prueba_estado (spec 50). */
export const ESTADOS_PRUEBA = ['EN_PROCESO', 'ACEPTADA', 'RECHAZADA', 'ERROR'] as const;
export type EstadoPrueba = (typeof ESTADOS_PRUEBA)[number];

/** Una prueba aceptada habilita el paso a producción durante este tiempo. */
export const VIGENCIA_PRUEBA_HORAS = 24;
/** Una prueba EN_PROCESO más vieja se da por atascada (el worker murió entre reintentos) y se puede pedir otra. */
export const PRUEBA_ATASCADA_MINUTOS = 10;
