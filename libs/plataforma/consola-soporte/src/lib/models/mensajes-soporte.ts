import type { TonoEstado } from '@vitrina/shared/ui';
import type { EstadoSoporte, ModoSoporte } from './acceso-del-agente';

/** Permiso del agente (manifiesto PLAT 1.7.0): solo lo tiene `PLAT_AGENTE_SOPORTE` del tenant operador. */
export const PERMISO_SOLICITAR_SOPORTE = 'plat.soporte.solicitar';

export const MENSAJE_ERROR_DESCONOCIDO = 'No se pudo completar la acción. Inténtelo de nuevo.';

/** Textos de la consola del agente de soporte (spec 18, TR-RF-020) en español de Perú. */
export const MENSAJES_SOPORTE = {
  titulo: 'Mis accesos de soporte',
  solicitarAcceso: 'Solicitar acceso',
  tituloSolicitar: 'Solicitar acceso de soporte',
  volver: 'Volver a mis accesos',
  entrar: 'Entrar',
  sinAccesos: 'Todavía no pidió accesos de soporte',
  tenant: 'Tenant del cliente',
  buscarTenant: 'Escriba el nombre o el código',
  sinTenants: 'Ningún tenant coincide',
  ticket: 'Ticket',
  ayudaTicket: 'Formato SOP-######',
  motivo: 'Motivo',
  ayudaMotivo: 'De 10 a 300 caracteres: el administrador del cliente lo lee para aprobar.',
  modo: 'Modo',
  horas: 'Horas que pide',
  enviar: 'Enviar solicitud',
  solicitudEnviada: 'Solicitud enviada: espere la aprobación del administrador del cliente',
  entrando: 'Entrando al tenant del cliente…',
  sinDato: '—',
  tenantRequerido: 'Elija un tenant de la lista',
} as const;

export const COLUMNAS_SOPORTE = {
  tenant: 'Tenant',
  ticket: 'Ticket',
  modo: 'Modo',
  estado: 'Estado',
  fin: 'Termina',
} as const;

export const ETIQUETAS_ESTADO_SOPORTE: Readonly<Record<EstadoSoporte, string>> = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Vigente',
  RECHAZADO: 'Rechazado',
  REVOCADO: 'Revocado',
  EXPIRADO: 'Expirado',
};

/** Mismo mapa que la bandeja del cliente (spec 18). */
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

export function etiquetaHoras(horas: number): string {
  return horas === 1 ? '1 hora' : `${horas} horas`;
}
