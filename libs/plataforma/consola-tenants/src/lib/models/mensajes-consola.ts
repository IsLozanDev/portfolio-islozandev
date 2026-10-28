import { MENSAJES_SHELL } from '@vitrina/shared/shell';
import type { EstadoTenant, Modalidad } from './catalogos';

/** Textos de la consola de tenants, en español de Perú. */
export const MENSAJES_CONSOLA = {
  tituloTenants: 'Tenants',
  nuevoTenant: 'Nuevo tenant',
  buscarTenant: 'Buscar por código o nombre',
  sinTenants: 'No hay tenants con estos filtros.',
  verDetalle: 'Ver detalle',
  sinSuscripciones: '—',
} as const;

export const MENSAJES_DETALLE = {
  volver: 'Volver a tenants',
  noExiste: 'El tenant no existe',
  ultimoCambio: 'Último cambio',
  suscripciones: 'Suscripciones',
  producto: 'Producto',
  plan: 'Plan',
  estado: 'Estado',
  vigenteHasta: 'Vigente hasta',
  sinVencimiento: 'Sin vencimiento',
  empresaPrincipal: 'Empresa principal',
  sinEmpresa: 'Sin empresa principal',
  ruc: 'RUC',
  historial: 'Historial de estados',
  sinHistorial: 'Sin cambios de estado.',
  yaEstaba: 'El tenant ya estaba en ese estado.',
} as const;

export const MENSAJES_ALTA = {
  titulo: 'Nuevo tenant',
  pasoTenant: 'Tenant y suscripción',
  pasoEmpresa: 'Empresa y propietario',
  codigo: 'Código',
  ayudaCodigo: 'Minúsculas, números y guiones, p. ej. polleria-dona-rosa',
  nombre: 'Nombre',
  producto: 'Producto',
  plan: 'Plan',
  modalidad: 'Modalidad',
  vigenteHasta: 'Vigente hasta',
  ruc: 'RUC',
  razonSocial: 'Razón social',
  nombreComercial: 'Nombre comercial (opcional)',
  correoPropietario: 'Correo del propietario',
  nombrePropietario: 'Nombre del propietario',
  siguiente: 'Siguiente',
  anterior: 'Anterior',
  crear: 'Crear tenant',
  creado: 'Tenant creado',
  correoNoEnviado: 'El tenant se creó, pero no se pudo enviar el correo al propietario.',
  codigoFormato: 'Use minúsculas, números y guiones, sin espacios.',
  rucInvalido: 'RUC inválido',
} as const;

export const ETIQUETAS_MODALIDAD: Readonly<Record<Modalidad, string>> = {
  PRUEBA: 'Prueba',
  ACTIVO: 'Activo',
};

export interface ConfirmacionDeEstado {
  boton: string;
  titulo: (codigo: string) => string;
  texto: string;
  hecho: string;
}

/** Textos de cada destino de TR-RF-006; el motivo lo pide `confirmarDestructiva` (mínimo 10). */
export const CONFIRMACIONES_ESTADO: Readonly<Record<Exclude<EstadoTenant, 'PRUEBA'>, ConfirmacionDeEstado>> = {
  ACTIVO: {
    boton: 'Activar',
    titulo: (codigo) => `¿Activar «${codigo}»?`,
    texto: 'El tenant volverá a operar con normalidad. Indique el motivo.',
    hecho: 'Tenant activado',
  },
  SUSPENDIDO: {
    boton: 'Suspender',
    titulo: (codigo) => `¿Suspender «${codigo}»?`,
    texto: 'Sus usuarios solo podrán consultar y pagar. Indique el motivo.',
    hecho: 'Tenant suspendido',
  },
  BAJA: {
    boton: 'Dar de baja',
    titulo: (codigo) => `¿Dar de baja «${codigo}»?`,
    texto: 'Un tenant dado de baja no puede reactivarse. Indique el motivo.',
    hecho: 'Tenant dado de baja',
  },
};

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
