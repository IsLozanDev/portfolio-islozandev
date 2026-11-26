/** Por qué un intento quedó `NO_ENVIADO`; cabe en fe.envio.codigo (20). */
export const MOTIVOS_NO_ENVIO = {
  emisorNoHabilitado: 'EMISOR_NO_HABILITADO',
  sinAdaptador: 'SIN_ADAPTADOR',
  datosIncompletos: 'DATOS_INCOMPLETOS',
  urlNoPermitida: 'URL_NO_PERMITIDA',
} as const;
export type MotivoNoEnvio = (typeof MOTIVOS_NO_ENVIO)[keyof typeof MOTIVOS_NO_ENVIO];
