export const AGREGADO_MENSAJE = 'mensaje';
export const AGREGADO_PROGRAMACION = 'programacion';
export const VERSION_ESQUEMA_NOT = 1;

/** Eventos internos de notificaciones en el outbox, en schema_version 1. No son públicos. */
export const EVENTOS_NOT = {
  mensajeSolicitado: 'not.mensaje.solicitado',
  programacionRegistrada: 'not.programacion.registrada',
} as const;

/** Sin destino ni variables (TR-RNF-026): el worker lee el mensaje por su id. `programado_para` en ISO 8601 UTC. */
export interface MensajeSolicitado {
  mensaje_id: string;
  programado_para?: string;
}

/** Spec 45. Sin destinatario ni variables: la ejecución relee la programación. `enviar_en` en ISO 8601 UTC. */
export interface ProgramacionRegistrada {
  programacion_id: string;
  version: number;
  enviar_en: string;
}
