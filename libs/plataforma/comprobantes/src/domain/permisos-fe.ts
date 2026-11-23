/** Declarados en el manifiesto PLAT 1.25.0. `configurar` es sensible: PermisoGuard exige aal2 (TR-RN-009). */
export const PERMISOS_FE = {
  configurar: 'plat.fe.configurar',
  consultar: 'plat.fe.consultar',
} as const;

export const PARAMETRO_DIAS_AVISO_CERTIFICADO = 'plat.fe.dias_aviso_certificado';
