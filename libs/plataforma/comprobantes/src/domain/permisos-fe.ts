/**
 * Declarados en el manifiesto PLAT: `configurar` y `consultar` desde 1.25.0, `emitir` desde 1.29.0 (spec 51).
 * `configurar` es sensible: PermisoGuard exige aal2 (TR-RN-009). `emitir` no: la caja emite sin step-up.
 */
export const PERMISOS_FE = {
  configurar: 'plat.fe.configurar',
  consultar: 'plat.fe.consultar',
  emitir: 'plat.fe.emitir',
} as const;

export const PARAMETRO_DIAS_AVISO_CERTIFICADO = 'plat.fe.dias_aviso_certificado';
/** TR-RN-018: total de boleta por encima del cual se exige identificar al adquirente. */
export const PARAMETRO_UMBRAL_BOLETA = 'plat.fe.boleta_monto_identificacion';
