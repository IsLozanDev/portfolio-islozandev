import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { EVENTOS_NOT, VERSION_ESQUEMA_NOT } from '../domain/eventos-not.js';

// Ajv en modo estricto: sin `format` ni uniones de tipos en `type` (mismo criterio que el resto de componentes).
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
/** `toISOString()`: siempre en UTC con milisegundos. */
const instante = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' };

/** `additionalProperties: false` impide que entren el destino o las variables (TR-RNF-026). */
export const ESQUEMAS_NOT: Readonly<Record<string, object>> = {
  [EVENTOS_NOT.mensajeSolicitado]: {
    type: 'object',
    properties: { mensaje_id: uuid, programado_para: instante },
    required: ['mensaje_id'],
    additionalProperties: false,
  },
};

export function registrarEsquemasNot(validador: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [tipoEvento, esquema] of Object.entries(ESQUEMAS_NOT)) {
    validador.register(tipoEvento, VERSION_ESQUEMA_NOT, esquema);
  }
}
