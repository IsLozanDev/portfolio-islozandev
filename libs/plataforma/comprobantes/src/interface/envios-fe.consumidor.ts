import { SuscribirEvento, type EventoEntregado } from '@vitrina/plataforma/eventos';
import type { EncolarEnvioComprobante } from '../application/encolar-envio-comprobante.js';
import { EVENTOS_FE, type ComprobanteEmitidoEvento } from '../domain/eventos-fe.js';

export const CONSUMIDOR_ENVIOS_FE = 'fe-envios-encolado';

/** Pasa cada comprobante emitido a la cola `fe-envios`. EventosModule.registrarWorker lo descubre. */
export class EnviosFeConsumidor {
  constructor(private readonly encolarEnvio: EncolarEnvioComprobante) {}

  @SuscribirEvento(EVENTOS_FE.comprobanteEmitido, { consumidor: CONSUMIDOR_ENVIOS_FE })
  comprobanteEmitido(evento: EventoEntregado): Promise<void> {
    return this.encolarEnvio.ejecutar(evento.tenantId, evento.payload as ComprobanteEmitidoEvento);
  }
}
