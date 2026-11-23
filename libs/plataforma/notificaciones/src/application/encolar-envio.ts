import type { MensajeSolicitado } from '../domain/eventos-not.js';
import type { DependenciasEncolado } from './dependencias.js';

const SIN_RETARDO = 0;

/**
 * Consumidor de `not.mensaje.solicitado`: agrega el mensaje a `not-envios`, con retardo hasta `programado_para`
 * si lo tiene. Idempotente por `event_id` (EVT) y por `jobId = mensajeId` (BullMQ).
 */
export class EncolarEnvio {
  constructor(private readonly dependencias: DependenciasEncolado) {}

  ejecutar(tenantId: string, solicitud: MensajeSolicitado): Promise<void> {
    return this.dependencias.cola.encolar({ tenantId, mensajeId: solicitud.mensaje_id }, this.retardoHasta(solicitud.programado_para));
  }

  private retardoHasta(programadoPara: string | undefined): number {
    if (!programadoPara) return SIN_RETARDO;
    return Math.max(SIN_RETARDO, new Date(programadoPara).getTime() - this.dependencias.reloj.now().getTime());
  }
}
