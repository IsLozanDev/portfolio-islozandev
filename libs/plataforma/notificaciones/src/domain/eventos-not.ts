export const AGREGADO_MENSAJE = 'mensaje';
export const VERSION_ESQUEMA_NOT = 1;

/** Eventos internos de notificaciones en el outbox, en schema_version 1. No son públicos. */
export const EVENTOS_NOT = {
  mensajeSolicitado: 'not.mensaje.solicitado',
} as const;

/** Sin destino ni variables (TR-RNF-026): el worker lee el mensaje por su id. `programado_para` en ISO 8601 UTC. */
export interface MensajeSolicitado {
  mensaje_id: string;
  programado_para?: string;
}
