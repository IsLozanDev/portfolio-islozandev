import { MENSAJES_SHELL } from '@vitrina/shared/shell';
import type { EstadoTenant } from './catalogos';

/** Textos de la consola de tenants, en español de Perú. */
export const MENSAJES_CONSOLA = {
  tituloTenants: 'Tenants',
  nuevoTenant: 'Nuevo tenant',
  buscarTenant: 'Buscar por código o nombre',
  sinTenants: 'No hay tenants con estos filtros.',
  verDetalle: 'Ver detalle',
  sinSuscripciones: '—',
} as const;

export const COLUMNAS_TENANTS = {
  codigo: 'Código',
  nombre: 'Nombre',
  estado: 'Estado',
  suscripciones: 'Suscripciones',
  creadoEn: 'Creado',
  producto: 'Producto',
} as const;

export const ETIQUETAS_ESTADO_TENANT: Readonly<Record<EstadoTenant, string>> = {
  PRUEBA: 'Prueba',
  ACTIVO: 'Activo',
  SUSPENDIDO: 'Suspendido',
  BAJA: 'Baja',
};

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
