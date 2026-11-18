import type { ProductoCodigo } from '@vitrina/plataforma/org';
import type { TipoDocumentoPersona } from './documento-identidad.js';
import type { TipoPersona } from './persona.js';
import type { FechaRol, RolPersona } from './rol-persona.js';

export const AGREGADO_PERSONA = 'persona';
export const VERSION_ESQUEMA_PER = 1;

/** Eventos de personas en el outbox, en schema_version 1. `persona.rol_asignado` es un añadido al SRS. */
export const EVENTOS_PER = {
  registrada: 'persona.registrada',
  rolAsignado: 'persona.rol_asignado',
} as const;

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
