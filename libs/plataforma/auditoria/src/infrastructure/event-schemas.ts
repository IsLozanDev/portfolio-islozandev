import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { EVENTOS_AUD } from '../domain/eventos.js';
import { MODOS_VERIFICACION, MOTIVOS_ROTURA } from '../domain/verificacion.js';

// Ajv en modo estricto: sin `format` ni uniones de tipos en `type` (mismo criterio que org y seg).
const numeroDeCadena = { type: 'string', pattern: '^\\d{1,19}$' };

/** Esquemas de los eventos de aud, todos en schema_version 1. */
export const ESQUEMAS_AUD: Readonly<Record<string, object>> = {
  [EVENTOS_AUD.integridadRota]: {
    type: 'object',
    properties: { numero_roto: numeroDeCadena, motivo: { enum: [...MOTIVOS_ROTURA] }, modo: { enum: [...MODOS_VERIFICACION] }, desde_numero: numeroDeCadena },
    required: ['numero_roto', 'motivo', 'modo', 'desde_numero'],
    additionalProperties: false,
  },
};

export function registrarEsquemasAud(validator: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [eventType, schema] of Object.entries(ESQUEMAS_AUD)) validator.register(eventType, 1, schema);
}
