import type { IdGenerator } from '@vitrina/plataforma/kernel';
import type { EventoEntregado } from '@vitrina/plataforma/eventos';
import { prepararContenido } from '../domain/contenido.js';
import type { RegistroAuditoria } from './ports/registro-auditoria.port.js';

export interface DependenciasAuditoriaEventos {
  ids: IdGenerator;
  registro: RegistroAuditoria;
}

/**
 * Audita un evento de ORG o de suscripción: las libs de plataforma no pueden importar comp:aud (PL-10) y
 * llegan por el outbox. Corre en la transacción de la entrega, con el tenant del evento. `antes` queda
 * vacío: el payload es la foto del agregado tras el cambio.
 */
export class AuditarEventoDePlataforma {
  constructor(private readonly dependencias: DependenciasAuditoriaEventos) {}

  async ejecutar(evento: EventoEntregado): Promise<void> {
    await this.dependencias.registro.insertar({
      id: this.dependencias.ids.next(),
      tenantId: evento.tenantId,
      tipo: 'OPERACION',
      origen: 'EVENTO',
      eventId: evento.eventId,
      accion: evento.eventType,
      entidadTipo: evento.aggregateType,
      entidadId: evento.aggregateId,
      usuarioId: evento.actorId ?? undefined,
      sucursalId: evento.sedeId ?? undefined,
      ip: evento.ip ?? undefined,
      traceId: evento.traceId ?? undefined,
      ocurridoEn: new Date(evento.occurredAt),
      despues: prepararContenido(evento.payload),
    });
  }
}
