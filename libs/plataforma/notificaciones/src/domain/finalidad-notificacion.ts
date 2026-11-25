export const FINALIDADES_NOTIFICACION = ['TRANSACCIONAL', 'PROMOCIONAL'] as const;
export type FinalidadNotificacion = (typeof FINALIDADES_NOTIFICACION)[number];

export const FINALIDAD_PROMOCIONAL = 'PROMOCIONAL' satisfies FinalidadNotificacion;
export const FINALIDAD_TRANSACCIONAL = 'TRANSACCIONAL' satisfies FinalidadNotificacion;

/** TR-RN-025: un mensaje PROMOCIONAL exige este consentimiento vigente de la persona en TR-PER. */
export const CONSENTIMIENTO_PROMOCIONAL = 'PROMOCIONES';
