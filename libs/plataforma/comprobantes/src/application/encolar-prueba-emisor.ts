import type { PruebaSolicitada } from '../domain/eventos-fe.js';
import type { ColaPruebasFe } from './ports/cola-pruebas-fe.js';

/**
 * Consumidor de `fe.prueba.solicitada` en el worker: pasa la prueba a la cola `fe-pruebas`. Idempotente por
 * `event_id` (EVT) y por `jobId = emisorId-numeroPrueba` (BullMQ). Si Redis falla, el relay reintenta el evento.
 */
export class EncolarPruebaEmisor {
  constructor(private readonly cola: ColaPruebasFe) {}

  ejecutar(tenantId: string, solicitud: PruebaSolicitada): Promise<void> {
    return this.cola.encolar({ tenantId, emisorId: solicitud.emisor_id, numeroPrueba: solicitud.numero_prueba });
  }
}
