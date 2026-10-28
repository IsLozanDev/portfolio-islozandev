import { MENSAJES_SHELL } from '@vitrina/shared/shell';

/** Textos de la consola de tenants, en español de Perú. */
export const MENSAJES_CONSOLA = {
  tituloTenants: 'Tenants',
} as const;

/**
 * Texto para los códigos que la API responde sin `mensaje`. Los demás traen el suyo y se muestran
 * tal cual como texto plano.
 */
export const MENSAJES_POR_CODIGO: Readonly<Record<string, string>> = {
  SOLICITUD_INVALIDA: 'Revise los datos del formulario.',
  MFA_REQUERIDA: MENSAJES_SHELL.mfaRequerida,
  SIN_PERMISO: 'No tiene permiso para esta acción.',
};

export const MENSAJE_ERROR_DESCONOCIDO = 'Ocurrió un error. Inténtelo de nuevo.';
