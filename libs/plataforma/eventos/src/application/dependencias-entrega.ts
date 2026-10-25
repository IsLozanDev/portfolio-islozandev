import type { Clock, IdGenerator, TenantContext, TenantScope, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { EventoEntregado } from '../domain/evento-entregado.js';
import type { RegistroProcesados, RepositorioFallidos } from './ports/repositorios.js';
import type { RegistroSuscripciones } from './ports/suscripciones.js';

/** Log estructurado. Los datos nunca llevan el payload del evento (TR-RNF-026). */
export type Avisar = (mensaje: string, datos: Record<string, unknown>) => void;

/** Lo que comparten EntregarEvento y RegistrarFallo. */
export interface DependenciasEntrega {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  reloj: Clock;
  suscripciones: RegistroSuscripciones;
  procesados: RegistroProcesados;
  fallidos: RepositorioFallidos;
  avisar: Avisar;
}

/** El efecto corre con la RLS del tenant del evento (TR-RNF-010). */
export function alcanceDelEvento(evento: EventoEntregado): TenantScope {
  return evento.sedeId === null ? { tenantId: evento.tenantId } : { tenantId: evento.tenantId, branchId: evento.sedeId };
}

/** Datos de log de una entrega: identifican el evento sin exponer su contenido. */
export function datosDeLog(consumidor: string, evento: EventoEntregado): Record<string, unknown> {
  return { consumidor, event_id: evento.eventId, event_type: evento.eventType, tenant_id: evento.tenantId };
}
