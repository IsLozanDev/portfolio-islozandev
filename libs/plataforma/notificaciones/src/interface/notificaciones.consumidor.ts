import { SuscribirEvento, type EventoEntregado } from '@vitrina/plataforma/eventos';
import type { EncolarEnvio } from '../application/encolar-envio.js';
import { EVENTOS_NOT, type MensajeSolicitado } from '../domain/eventos-not.js';

export const CONSUMIDOR_NOT = 'not-encolado';

/** Pasa cada mensaje solicitado a la cola `not-envios`. EventosModule.registrarWorker lo descubre. */
export class NotificacionesConsumidor {
  constructor(private readonly encolarEnvio: EncolarEnvio) {}

  @SuscribirEvento(EVENTOS_NOT.mensajeSolicitado, { consumidor: CONSUMIDOR_NOT })
  mensajeSolicitado(evento: EventoEntregado): Promise<void> {
    return this.encolarEnvio.ejecutar(evento.tenantId, evento.payload as MensajeSolicitado);
  }
}
