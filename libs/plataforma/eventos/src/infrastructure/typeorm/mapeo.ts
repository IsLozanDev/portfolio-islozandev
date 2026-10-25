import { EventoFallido } from '../../domain/evento-fallido.js';
import type { FilaEventoFallido } from './entidades.js';

// Las entidades ORM no son los agregados: el paso de una a otro va aquí, campo por campo.

export function fallidoDesdeFila(fila: FilaEventoFallido): EventoFallido {
  return EventoFallido.reconstituir(fila.id, Number(fila.version), {
    tenantId: fila.tenantId,
    consumidor: fila.consumidor,
    eventId: fila.eventId,
    eventType: fila.eventType,
    aggregateType: fila.aggregateType,
    aggregateId: fila.aggregateId,
    error: fila.error,
    intentos: fila.intentos,
    estado: fila.estado,
    fallidoEn: fila.fallidoEn,
    reprocesadoPor: fila.reprocesadoPor,
    reprocesadoEn: fila.reprocesadoEn,
  });
}

export function filaDesdeFallido(fallido: EventoFallido, version: number): FilaEventoFallido {
  return {
    id: fallido.id,
    tenantId: fallido.tenantId,
    consumidor: fallido.consumidor,
    eventId: fallido.eventId,
    eventType: fallido.eventType,
    aggregateType: fallido.aggregateType,
    aggregateId: fallido.aggregateId,
    error: fallido.error,
    intentos: fallido.intentos,
    estado: fallido.estado,
    fallidoEn: fallido.fallidoEn,
    reprocesadoPor: fallido.reprocesadoPor,
    reprocesadoEn: fallido.reprocesadoEn,
    version: String(version),
  };
}
