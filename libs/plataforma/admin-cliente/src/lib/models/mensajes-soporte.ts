import type { TonoEstado } from '@vitrina/shared/ui';
import type { CausaCierreSoporte, EstadoSoporte, ModoSoporte, VistaSoporte } from './acceso-soporte';

/** Textos de la bandeja y la aprobación de soporte (spec 18, TR-RF-020) en español de Perú. */
export const MENSAJES_SOPORTE = {
  titulo: 'Soporte',
  pestanas: 'Solicitudes de soporte',
  tituloAprobar: 'Aprobar acceso de soporte',
  volver: 'Volver a soporte',
  aprobar: 'Aprobar',
  rechazar: 'Rechazar',
  revocar: 'Revocar',
  cancelar: 'Cancelar',
  horas: 'Horas de acceso',
  rolOPerfil: 'Rol o perfil del agente',
  roles: 'Roles',
  perfiles: 'Perfiles',
  ayudaRol: 'El agente trabajará en todo el tenant con estos permisos, salvo administrar usuarios, roles y soporte.',
  solicitud: 'Solicitud',
  agente: 'Agente',
  ticket: 'Ticket',
  motivo: 'Motivo',
  modo: 'Modo',
  solicitada: 'Solicitada',
  noPendiente: 'La solicitud ya no está pendiente: se aprobó, se rechazó o caducó.',
  aprobado: 'Acceso aprobado',
  rechazado: 'Solicitud rechazada',
  revocado: 'Acceso revocado',
  sinPendientes: 'No hay solicitudes pendientes',
  sinVigentes: 'No hay accesos de soporte vigentes',
  sinHistorial: 'Todavía no hay accesos cerrados',
  tituloRechazar: 'Rechazar la solicitud de soporte',
  textoRechazar: 'El agente no podrá entrar al tenant con esta solicitud.',
  tituloRevocar: 'Revocar el acceso de soporte',
  textoRevocar: 'El agente pierde el acceso al tenant en este momento.',
  sinDato: '—',
  sistema: 'Sistema',
} as const;

export const COLUMNAS_SOPORTE = {
  agente: 'Agente',
  ticket: 'Ticket',
  modo: 'Modo',
  horas: 'Horas',
  fecha: 'Fecha',
  estado: 'Estado',
} as const;

export const ETIQUETAS_VISTA_SOPORTE: Readonly<Record<VistaSoporte, string>> = {
  pendientes: 'Pendientes',
  vigentes: 'Vigentes',
  historial: 'Historial',
};

export const ETIQUETAS_ESTADO_SOPORTE: Readonly<Record<EstadoSoporte, string>> = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Vigente',
  RECHAZADO: 'Rechazado',
  REVOCADO: 'Revocado',
  EXPIRADO: 'Expirado',
};

/** Spec 18: pendiente en advertencia, aprobado en éxito, los cerrados neutros. */
export const TONOS_ESTADO_SOPORTE: Readonly<Record<EstadoSoporte, TonoEstado>> = {
  PENDIENTE: 'advertencia',
  APROBADO: 'exito',
  RECHAZADO: 'neutro',
  REVOCADO: 'neutro',
  EXPIRADO: 'neutro',
};

export const ETIQUETAS_MODO_SOPORTE: Readonly<Record<ModoSoporte, string>> = {
  LECTURA: 'Solo lectura',
  ESCRITURA: 'Lectura y escritura',
};

export const ETIQUETAS_CAUSA_CIERRE: Readonly<Record<CausaCierreSoporte, string>> = {
  RECHAZO: 'Rechazada',
  ADMINISTRADOR: 'Revocada por el administrador',
  TICKET_CERRADO: 'Ticket cerrado',
  VENCIMIENTO: 'Venció',
};

export function etiquetaHoras(horas: number): string {
  return horas === 1 ? '1 hora' : `${horas} horas`;
}

export function mensajeAprobadoHasta(hora: string): string {
  return `Acceso aprobado hasta las ${hora}`;
}
