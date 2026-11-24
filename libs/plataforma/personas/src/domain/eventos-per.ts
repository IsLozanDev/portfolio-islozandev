import type { DomainEvent } from '@vitrina/plataforma/kernel';
import type { ProductoCodigo } from '@vitrina/plataforma/org';
import type { Canal, Consentimiento, Finalidad } from './consentimiento.js';
import type { TipoDocumentoPersona } from './documento-identidad.js';
import type { TipoPersona } from './persona.js';
import type { FechaRol, RolPersona } from './rol-persona.js';

export const AGREGADO_PERSONA = 'persona';
export const VERSION_ESQUEMA_PER = 1;

/** Eventos de personas en el outbox, en schema_version 1. `persona.rol_asignado` es un añadido al SRS. */
export const EVENTOS_PER = {
  registrada: 'persona.registrada',
  rolAsignado: 'persona.rol_asignado',
  actualizada: 'persona.actualizada',
  consentimientoRevocado: 'consentimiento.revocado',
  fusionada: 'persona.fusionada',
} as const;

/** Qué parte de la persona cambió en un `persona.actualizada`. */
export const CAMBIOS_PERSONA = ['DATOS_BASICOS', 'CONTACTO', 'DIRECCION'] as const;
export type CambioPersona = (typeof CAMBIOS_PERSONA)[number];

/** Sin número de documento, nombres ni contactos: los consumidores leen la persona por `PersonaPort`. */
export interface PersonaRegistrada {
  persona_id: string;
  tipo_persona: TipoPersona;
  tipo_documento: TipoDocumentoPersona;
}

export interface PersonaRolAsignado {
  persona_id: string;
  producto_codigo: ProductoCodigo;
  rol: RolPersona;
  desde: FechaRol;
}

/** Sin nombres, contactos, direcciones ni ubigeo. */
export interface PersonaActualizada {
  persona_id: string;
  cambio: CambioPersona;
}

/** Del agregado de la conservada. Los consumidores reasignan sus referencias de la absorbida a la conservada. */
export interface PersonaFusionada {
  persona_conservada_id: string;
  persona_absorbida_id: string;
  fusion_id: string;
}

/** Sin nombres, documento, contactos ni el texto legal. `canal` es el de la revocación. */
export interface ConsentimientoRevocado {
  persona_id: string;
  finalidad: Finalidad;
  version_texto: string;
  canal: Canal;
  revocado_en: string;
}

/** Del agregado `persona`, con la versión que la persona tenía al revocar: revocar no la cambia. */
export function eventoConsentimientoRevocado(revocado: Consentimiento, versionPersona: number): DomainEvent<ConsentimientoRevocado> {
  const revocacion = revocado.revocacion;
  if (!revocacion) throw new Error('Solo un consentimiento revocado publica consentimiento.revocado');
  return {
    eventType: EVENTOS_PER.consentimientoRevocado,
    aggregateType: AGREGADO_PERSONA,
    aggregateId: revocado.personaId,
    aggregateVersion: versionPersona,
    schemaVersion: VERSION_ESQUEMA_PER,
    payload: {
      persona_id: revocado.personaId,
      finalidad: revocado.finalidad,
      version_texto: revocado.versionTexto,
      canal: revocacion.canal,
      revocado_en: revocacion.revocadoEn.toISOString(),
    },
    occurredAt: revocacion.revocadoEn,
  };
}
