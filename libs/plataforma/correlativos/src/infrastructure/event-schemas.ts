import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { EVENTOS_SEQ } from '../domain/eventos.js';
import { DIGITOS_MAXIMOS, DIGITOS_MINIMOS, REINICIOS, TIPOS_DOCUMENTO } from '../domain/tipos.js';

// Ajv en modo estricto: sin `format` ni uniones de tipos en `type` (mismo criterio que org, seg y cfg).
const nulo = { type: 'null' };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const uuidNulo = { anyOf: [uuid, nulo] };
const tipo = { enum: [...TIPOS_DOCUMENTO] };
const serie = { type: 'string', pattern: '^[A-Z0-9]{1,10}$' };

const objeto = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Esquemas de los eventos de seq, en schema_version 1. */
export const ESQUEMAS_SEQ: Readonly<Record<string, object>> = {
  [EVENTOS_SEQ.serieCreada]: objeto({
    serie_id: uuid,
    empresa_id: uuid,
    sucursal_id: uuidNulo,
    unidad_id: uuidNulo,
    tipo,
    serie,
    digitos: { type: 'integer', minimum: DIGITOS_MINIMOS, maximum: DIGITOS_MAXIMOS },
    reinicio: { enum: [...REINICIOS] },
    ultimo_numero: { type: 'integer', minimum: 0 },
    por: uuid,
  }),
  [EVENTOS_SEQ.serieEstadoCambiado]: objeto({
    serie_id: uuid,
    tipo,
    serie,
    activa: { type: 'boolean' },
    por: uuid,
  }),
};

export function registrarEsquemasSeq(validador: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [tipoEvento, esquema] of Object.entries(ESQUEMAS_SEQ)) validador.register(tipoEvento, 1, esquema);
}
