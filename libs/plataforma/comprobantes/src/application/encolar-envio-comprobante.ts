import type { ComprobanteEmitidoEvento } from '../domain/eventos-fe.js';
import type { ColaEnviosFe } from './ports/cola-envios-fe.js';

/**
 * Consumidor de `cpe.emitido` en el worker: pasa el comprobante a la cola `fe-envios`. Idempotente por `event_id`
 * (EVT) y por `jobId = comprobanteId` (BullMQ). Una boleta en modo RESUMEN la descarta el procesador, que lee el
 * comprobante: el evento no trae el modo. Si Redis falla, el relay reintenta el evento.
 */
export class EncolarEnvioComprobante {
  constructor(private readonly cola: ColaEnviosFe) {}

  ejecutar(tenantId: string, emitido: ComprobanteEmitidoEvento): Promise<void> {
    return this.cola.encolar({ tenantId, comprobanteId: emitido.comprobante_id });
  }
}
