/** Textos de la administración del cliente, en español de Perú. */
export const MENSAJES_ADMIN = {
  tituloUsuarios: 'Usuarios',
  tituloMfaRequerida: 'Verificación requerida',
  mfaRequerida: 'Esta acción es sensible. Verifique su identidad con el segundo factor y vuelva a intentarlo.',
} as const;

/**
 * Texto para los códigos que la API responde sin `mensaje`. Los demás traen el suyo, con los textos
 * del SRS, y se muestran tal cual como texto plano.
 */
export const MENSAJES_POR_CODIGO: Readonly<Record<string, string>> = {
  SOLICITUD_INVALIDA: 'Revise los datos del formulario.',
  MFA_REQUERIDA: MENSAJES_ADMIN.mfaRequerida,
  SIN_PERMISO: 'No tiene permiso para esta acción.',
  SUCURSAL_NO_ASIGNADA: 'No tiene acceso a la sucursal seleccionada.',
};

export const MENSAJE_ERROR_DESCONOCIDO = 'Ocurrió un error. Inténtelo de nuevo.';
