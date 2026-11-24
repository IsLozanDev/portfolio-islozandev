import { SuscribirEvento, type EventoEntregado } from '@vitrina/plataforma/eventos';
import type { EncolarPruebaEmisor } from '../application/encolar-prueba-emisor.js';
import { EVENTOS_FE, type PruebaSolicitada } from '../domain/eventos-fe.js';

export const CONSUMIDOR_PRUEBAS_FE = 'fe-pruebas-encolado';

/** Pasa cada prueba solicitada a la cola `fe-pruebas`. EventosModule.registrarWorker lo descubre. */
export class PruebasFeConsumidor {
  constructor(private readonly encolarPrueba: EncolarPruebaEmisor) {}

  @SuscribirEvento(EVENTOS_FE.pruebaSolicitada, { consumidor: CONSUMIDOR_PRUEBAS_FE })
  pruebaSolicitada(evento: EventoEntregado): Promise<void> {
    return this.encolarPrueba.ejecutar(evento.tenantId, evento.payload as PruebaSolicitada);
  }
}
