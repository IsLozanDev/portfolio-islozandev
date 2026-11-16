import type { DomainEvent } from '@vitrina/plataforma/kernel';
import { porcentajeConsumo, type EstadoCuota } from './estado-cuota.js';
import type { Periodo } from './periodo.js';

/** La cuota no tiene id propio: el agregado es el tenant y su versión, la de la fila. */
export const AGREGADO_CUOTA = 'cuota_identidad';
const VERSION_ESQUEMA = 1;

/** Eventos de idn en el outbox, en schema_version 1. */
export const EVENTOS_IDN = {
  cuotaUmbralAlcanzado: 'cuota.umbral_alcanzado',
  cuotaAgotada: 'cuota.agotada',
  cuotaAjustada: 'cuota.ajustada',
  proveedorActualizado: 'proveedor_identidad.actualizado',
} as const;

export interface CuotaUmbralAlcanzado {
  tenant_id: string;
  periodo: Periodo;
  incluidas: number;
  consumidas: number;
  porcentaje: number;
  umbral: number;
}

export interface CuotaAgotada {
  tenant_id: string;
  periodo: Periodo;
  incluidas: number;
  consumidas: number;
}

export interface CuotaAjustada {
  tenant_id: string;
  periodo: Periodo;
  incluidas_anteriores: number;
  incluidas: number;
  actor_id: string;
}

export interface ProveedorIdentidadActualizado {
  codigo: string;
  prioridad: number;
  ttl_dias: number;
  timeout_ms: number;
  activo: boolean;
  actor_id: string;
}

function eventoDeCuota<P>(eventType: string, cuota: EstadoCuota, payload: P, ahora: Date): DomainEvent<P> {
  return {
    eventType,
    aggregateType: AGREGADO_CUOTA,
    aggregateId: cuota.tenantId,
    aggregateVersion: cuota.version,
    schemaVersion: VERSION_ESQUEMA,
    occurredAt: ahora,
    payload,
  };
}

export function eventoCuotaUmbralAlcanzado(cuota: EstadoCuota, umbral: number, ahora: Date): DomainEvent<CuotaUmbralAlcanzado> {
  const { tenantId, periodo, incluidas, consumidas } = cuota;
  const payload = { tenant_id: tenantId, periodo, incluidas, consumidas, porcentaje: porcentajeConsumo(cuota), umbral };
  return eventoDeCuota(EVENTOS_IDN.cuotaUmbralAlcanzado, cuota, payload, ahora);
}

export function eventoCuotaAgotada(cuota: EstadoCuota, ahora: Date): DomainEvent<CuotaAgotada> {
  const { tenantId, periodo, incluidas, consumidas } = cuota;
  return eventoDeCuota(EVENTOS_IDN.cuotaAgotada, cuota, { tenant_id: tenantId, periodo, incluidas, consumidas }, ahora);
}

/** `cuota` es la fila ya guardada, con la versión nueva. */
export function eventoCuotaAjustada(
  cuota: EstadoCuota,
  incluidasAnteriores: number,
  actorId: string,
  ahora: Date,
): DomainEvent<CuotaAjustada> {
  const payload = {
    tenant_id: cuota.tenantId,
    periodo: cuota.periodo,
    incluidas_anteriores: incluidasAnteriores,
    incluidas: cuota.incluidas,
    actor_id: actorId,
  };
  return eventoDeCuota(EVENTOS_IDN.cuotaAjustada, cuota, payload, ahora);
}
