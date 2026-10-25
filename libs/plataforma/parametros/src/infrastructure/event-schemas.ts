import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { EVENTOS_CFG } from '../domain/eventos.js';

// Ajv en modo estricto: sin `format` ni uniones de tipos en `type` (mismo criterio que org y seg).
const texto = { type: 'string' };
const nulo = { type: 'null' };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const uuidNulo = { anyOf: [uuid, nulo] };
/** El valor sigue el tipo de su definición (texto, número, booleano u objeto): cualquier JSON. */
const cualquierJson = {};

const objeto = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Esquemas de los eventos de cfg, en schema_version 1. */
export const ESQUEMAS_CFG: Readonly<Record<string, object>> = {
  [EVENTOS_CFG.parametroCambiado]: objeto({
    codigo: texto,
    alcance: { enum: ['TENANT', 'EMPRESA', 'SUCURSAL'] },
    empresa_id: uuidNulo,
    sucursal_id: uuidNulo,
    valor_anterior: cualquierJson,
    valor: cualquierJson,
    restablecido: { type: 'boolean' },
    por: uuid,
  }),
};

export function registrarEsquemasCfg(validador: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [tipoEvento, esquema] of Object.entries(ESQUEMAS_CFG)) validador.register(tipoEvento, 1, esquema);
}
