import type { ReferenciaProgramacion } from '../domain/referencia-programacion.js';
import type { EnviarNotificacion } from './enviar-notificacion.js';
import type {
  EnviarNotificacionComando,
  NotificacionPort,
  NotificacionProgramada,
  NotificacionRegistrada,
  ProgramarNotificacionComando,
} from './ports/notificacion.port.js';
import type { CancelarProgramaciones } from './programaciones/cancelar-programaciones.js';
import type { ProgramarNotificacion } from './programaciones/programar-notificacion.js';

export interface CasosDeUsoNotificacion {
  enviar: Pick<EnviarNotificacion, 'enviar'>;
  programar: Pick<ProgramarNotificacion, 'ejecutar'>;
  cancelar: Pick<CancelarProgramaciones, 'ejecutar'>;
}

/** `NOTIFICACION_PORT`: envío inmediato (spec 42) y recordatorios programados (spec 45). */
export class ServicioNotificaciones implements NotificacionPort {
  constructor(private readonly casosDeUso: CasosDeUsoNotificacion) {}

  enviar(comando: EnviarNotificacionComando): Promise<NotificacionRegistrada> {
    return this.casosDeUso.enviar.enviar(comando);
  }

  programar(comando: ProgramarNotificacionComando): Promise<NotificacionProgramada> {
    return this.casosDeUso.programar.ejecutar(comando);
  }

  cancelar(referencia: ReferenciaProgramacion, plantilla?: string): Promise<number> {
    return this.casosDeUso.cancelar.ejecutar(referencia, plantilla);
  }
}
