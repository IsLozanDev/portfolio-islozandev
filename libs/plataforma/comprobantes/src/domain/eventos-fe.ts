import type { DomainEvent } from '@vitrina/plataforma/kernel';
import type { AmbienteEmisor } from './estado-emisor.js';

export const AGREGADO_EMISOR = 'emisor_fe';
export const VERSION_ESQUEMA_FE = 1;

/** Eventos de facturación electrónica en el outbox, en schema_version 1. */
export const EVENTOS_FE = {
  emisorConfigurado: 'fe.emisor.configurado',
  certificadoPorVencer: 'fe.certificado.por_vencer',
  emisorVerificado: 'fe.emisor.verificado',
  produccionHabilitada: 'fe.emisor.produccion_habilitada',
  /** Interno: lo consume el worker para encolar la prueba en `fe-pruebas`. */
  pruebaSolicitada: 'fe.prueba.solicitada',
} as const;

/** Sin usuario ni clave del proveedor ni nada del certificado. */
export interface EmisorConfigurado {
  emisor_id: string;
  empresa_id: string;
  proveedor: string;
  ambiente: AmbienteEmisor;
}

/** Carga de `fe.emisor.verificado` y `fe.emisor.produccion_habilitada`: sin token, usuario ni URL. */
export interface CambioEstadoEmisor {
  emisor_id: string;
  empresa_id: string;
  proveedor: string;
}

export interface PruebaSolicitada {
  emisor_id: string;
  numero_prueba: number;
}

/** `dias_restantes` es negativo si el certificado ya venció cuando corrió la tarea. */
export interface CertificadoPorVencer {
  emisor_id: string;
  empresa_id: string;
  ruc: string;
  vence_en: string;
  dias_restantes: number;
}

function evento<Carga>(tipo: string, emisorId: string, version: number, carga: Carga, ocurridoEn: Date): DomainEvent<Carga> {
  return {
    eventType: tipo,
    aggregateType: AGREGADO_EMISOR,
    aggregateId: emisorId,
    aggregateVersion: version,
    schemaVersion: VERSION_ESQUEMA_FE,
    payload: carga,
    occurredAt: ocurridoEn,
  };
}

export function emisorConfigurado(version: number, carga: EmisorConfigurado, ocurridoEn: Date): DomainEvent<EmisorConfigurado> {
  return evento(EVENTOS_FE.emisorConfigurado, carga.emisor_id, version, carga, ocurridoEn);
}

export function certificadoPorVencer(version: number, carga: CertificadoPorVencer, ocurridoEn: Date): DomainEvent<CertificadoPorVencer> {
  return evento(EVENTOS_FE.certificadoPorVencer, carga.emisor_id, version, carga, ocurridoEn);
}

export function emisorVerificado(version: number, carga: CambioEstadoEmisor, ocurridoEn: Date): DomainEvent<CambioEstadoEmisor> {
  return evento(EVENTOS_FE.emisorVerificado, carga.emisor_id, version, carga, ocurridoEn);
}

export function produccionHabilitada(version: number, carga: CambioEstadoEmisor, ocurridoEn: Date): DomainEvent<CambioEstadoEmisor> {
  return evento(EVENTOS_FE.produccionHabilitada, carga.emisor_id, version, carga, ocurridoEn);
}

export function pruebaSolicitada(version: number, carga: PruebaSolicitada, ocurridoEn: Date): DomainEvent<PruebaSolicitada> {
  return evento(EVENTOS_FE.pruebaSolicitada, carga.emisor_id, version, carga, ocurridoEn);
}
