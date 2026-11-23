import type { EstadoMensaje } from '../../domain/estado-mensaje.js';
import type { FinalidadNotificacion } from '../../domain/finalidad-notificacion.js';
import type { ValoresVariables } from '../../domain/renderizador-plantilla.js';

export const NOTIFICACION_PORT = Symbol('NotificacionPort');

/** Por persona (su correo principal en TR-PER) o por una dirección directa (p. ej. un propietario invitado). */
export type Destinatario = { personaId: string } | { correo: string };

export interface EnviarNotificacionComando {
  /** Código de la plantilla, p. ej. `PRUEBA_CORREO`. */
  plantilla: string;
  destinatario: Destinatario;
  variables: ValoresVariables;
  /** Por defecto CORREO; otro canal lanza `CanalNoHabilitadoError`. */
  canal?: 'CORREO';
  finalidad: FinalidadNotificacion;
  /** UUID: la misma clave en el tenant devuelve el mensaje existente. */
  claveIdempotencia: string;
}

export interface NotificacionRegistrada {
  mensajeId: string;
  /** Al registrar: ENCOLADO, OMITIDO_SIN_CONSENTIMIENTO o DESCARTADO. Una clave repetida trae el estado actual. */
  estado: EstadoMensaje;
  programadoPara?: Date;
  /** Misma clave: devuelve el mensaje existente. */
  repetida: boolean;
}

/** TR-RF-075. Tenant y usuario salen del TenantContext. Se une a la transacción del llamador (UnitOfWork.run). */
export interface NotificacionPort {
  enviar(comando: EnviarNotificacionComando): Promise<NotificacionRegistrada>;
}
