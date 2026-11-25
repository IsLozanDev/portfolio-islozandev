import { SuscribirEvento, type EventoEntregado } from '@vitrina/plataforma/eventos';
import type { AvisarIntegridadRota } from '../application/avisos/avisar-integridad-rota.js';
import type { AvisarSoporteSolicitado } from '../application/avisos/avisar-soporte-solicitado.js';
import type { AvisarSuscripcionPorVencer } from '../application/avisos/avisar-suscripcion-por-vencer.js';
import type { AvisarTenantSuspendido } from '../application/avisos/avisar-tenant-suspendido.js';
import type { EventoDeAviso } from '../application/avisos/envio-avisos.js';
import {
  EVENTOS_AVISADOS,
  type CargaIntegridadRota,
  type CargaSoporteSolicitado,
  type CargaSuscripcionPorVencer,
  type CargaTenantSuspendido,
} from '../domain/avisos-plataforma.js';

export const CONSUMIDOR_AVISOS = 'not-avisos-plataforma';

export interface CasosDeUsoAvisos {
  suscripcionPorVencer: AvisarSuscripcionPorVencer;
  tenantSuspendido: AvisarTenantSuspendido;
  soporteSolicitado: AvisarSoporteSolicitado;
  integridadRota: AvisarIntegridadRota;
}

function eventoDeAviso<Carga>(evento: EventoEntregado): EventoDeAviso<Carga> {
  return { eventId: evento.eventId, tenantId: evento.tenantId, payload: evento.payload as Carga };
}

/** Correos de los eventos de plataforma (spec 44). Idempotente por `event_id`; EventosModule.registrarWorker lo descubre. */
export class AvisosPlataformaConsumidor {
  constructor(private readonly avisos: CasosDeUsoAvisos) {}

  @SuscribirEvento(EVENTOS_AVISADOS.suscripcionPorVencer, { consumidor: CONSUMIDOR_AVISOS })
  suscripcionPorVencer(evento: EventoEntregado): Promise<void> {
    return this.avisos.suscripcionPorVencer.ejecutar(eventoDeAviso<CargaSuscripcionPorVencer>(evento));
  }

  @SuscribirEvento(EVENTOS_AVISADOS.tenantSuspendido, { consumidor: CONSUMIDOR_AVISOS })
  tenantSuspendido(evento: EventoEntregado): Promise<void> {
    return this.avisos.tenantSuspendido.ejecutar(eventoDeAviso<CargaTenantSuspendido>(evento));
  }

  @SuscribirEvento(EVENTOS_AVISADOS.soporteSolicitado, { consumidor: CONSUMIDOR_AVISOS })
  soporteSolicitado(evento: EventoEntregado): Promise<void> {
    return this.avisos.soporteSolicitado.ejecutar(eventoDeAviso<CargaSoporteSolicitado>(evento));
  }

  @SuscribirEvento(EVENTOS_AVISADOS.integridadRota, { consumidor: CONSUMIDOR_AVISOS })
  integridadRota(evento: EventoEntregado): Promise<void> {
    return this.avisos.integridadRota.ejecutar(eventoDeAviso<CargaIntegridadRota>(evento));
  }
}
