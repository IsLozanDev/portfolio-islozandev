import type { DomainEvent } from '@vitrina/plataforma/kernel';
import type { ModoVerificacion, MotivoRotura, Verificacion } from './verificacion.js';

export const EVENTOS_AUD = {
  integridadRota: 'aud.integridad.rota',
} as const;

const TIPO_AGREGADO_VERIFICACION = 'verificacion_integridad';
const VERSION_ESQUEMA = 1;
/** Una verificación no cambia: es la única versión de su agregado. */
const VERSION_AGREGADO = 1;

/** Los números son bigint como texto. Sin datos personales: OBS y NOT lo consumirán. */
export interface IntegridadRota {
  numero_roto: string;
  motivo: MotivoRotura;
  modo: ModoVerificacion;
  desde_numero: string;
}

export function eventoIntegridadRota(verificacion: Verificacion & { numeroRoto: string; motivo: MotivoRotura }): DomainEvent<IntegridadRota> {
  return {
    eventType: EVENTOS_AUD.integridadRota,
    aggregateType: TIPO_AGREGADO_VERIFICACION,
    aggregateId: verificacion.id,
    aggregateVersion: VERSION_AGREGADO,
    schemaVersion: VERSION_ESQUEMA,
    payload: { numero_roto: verificacion.numeroRoto, motivo: verificacion.motivo, modo: verificacion.modo, desde_numero: verificacion.desdeNumero },
    occurredAt: verificacion.terminadaEn,
  };
}
