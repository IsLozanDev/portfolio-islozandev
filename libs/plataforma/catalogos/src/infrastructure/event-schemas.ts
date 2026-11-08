import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { EVENTOS_CAT } from '../domain/eventos.js';

// Ajv en modo estricto: sin `format` ni uniones de tipos en `type` (mismo criterio que org, seg, cfg y seq).
const nulo = { type: 'null' };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const uuidNulo = { anyOf: [uuid, nulo] };
const version = { type: 'integer', minimum: 0 };
const cantidad = { type: 'integer', minimum: 0 };

const objeto = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Esquemas de los eventos de cat, en schema_version 1. */
export const ESQUEMAS_CAT: Readonly<Record<string, object>> = {
  [EVENTOS_CAT.catalogoActualizado]: objeto({
    catalogo_id: uuid,
    codigo: { type: 'string', pattern: '^[A-Z][A-Z0-9_]{2,59}$' },
    version_global: version,
    version_tenant: version,
    tenant_id: uuidNulo,
    // IMPORTACION llegó con el spec 19b sin subir schema_version: los consumidores ignoran los valores que no conocen.
    cambio: { enum: ['CATALOGO', 'ITEM', 'AJUSTE', 'IMPORTACION'] },
    item_id: uuidNulo,
    por: uuid,
  }),
  [EVENTOS_CAT.importacionAplicada]: objeto({
    importacion_id: uuid,
    catalogo_id: uuid,
    codigo: { type: 'string', pattern: '^[A-Z][A-Z0-9_]{2,59}$' },
    version_oficial: { type: 'string', minLength: 1, maxLength: 40 },
    fecha_vigencia: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    archivo_sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    altas: cantidad,
    cambios: cantidad,
    bajas: cantidad,
    version_global: version,
    por: uuid,
  }),
};

export function registrarEsquemasCat(validador: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [tipoEvento, esquema] of Object.entries(ESQUEMAS_CAT)) validador.register(tipoEvento, 1, esquema);
}
