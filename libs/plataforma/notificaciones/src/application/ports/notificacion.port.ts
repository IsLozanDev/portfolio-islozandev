import type { Destinatario } from '../../domain/destinatario.js';
import type { EstadoMensaje } from '../../domain/estado-mensaje.js';
import type { FinalidadNotificacion } from '../../domain/finalidad-notificacion.js';
import type { ReferenciaProgramacion } from '../../domain/referencia-programacion.js';
import type { ValoresVariables } from '../../domain/renderizador-plantilla.js';

export type { Destinatario } from '../../domain/destinatario.js';

export const NOTIFICACION_PORT = Symbol('NotificacionPort');

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

export interface ProgramarNotificacionComando extends Omit<EnviarNotificacionComando, 'claveIdempotencia'> {
  /** Futura y a no más de 366 días. */
  enviarEn: Date;
  referencia: ReferenciaProgramacion;
}

export interface NotificacionProgramada {
  programacionId: string;
  enviarEn: Date;
  /** true si ya había una viva con la misma referencia y plantilla y se actualizó. */
  reprogramada: boolean;
}

/** TR-RF-075 y TR-RF-076. Tenant y usuario salen del TenantContext. Se une a la transacción del llamador (UnitOfWork.run). */
export interface NotificacionPort {
  enviar(comando: EnviarNotificacionComando): Promise<NotificacionRegistrada>;
  /** TR-RF-076. Valida la plantilla al programar; a la hora llama a `enviar`, que revalida TR-RN-025. */
  programar(comando: ProgramarNotificacionComando): Promise<NotificacionProgramada>;
  /** Cancela las vivas de la referencia (todas o la de esa plantilla). Devuelve cuántas canceló (0 si no había). */
  cancelar(referencia: ReferenciaProgramacion, plantilla?: string): Promise<number>;
}
