import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { EVENTOS_IDN } from '../domain/eventos-idn.js';

// Ajv en modo estricto: sin `format` ni uniones de tipos en `type` (mismo criterio que cfg, org y seg).
const texto = { type: 'string' };
const entero = { type: 'integer', minimum: 0 };
const booleano = { type: 'boolean' };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const periodo = { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' };
const porcentaje = { type: 'integer', minimum: 0, maximum: 100 };

const objeto = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Esquemas de los eventos de idn, en schema_version 1. */
export const ESQUEMAS_IDN: Readonly<Record<string, object>> = {
  [EVENTOS_IDN.cuotaUmbralAlcanzado]: objeto({
    tenant_id: uuid,
    periodo,
    incluidas: entero,
    consumidas: entero,
    porcentaje,
    umbral: porcentaje,
  }),
  [EVENTOS_IDN.cuotaAgotada]: objeto({ tenant_id: uuid, periodo, incluidas: entero, consumidas: entero }),
  [EVENTOS_IDN.cuotaAjustada]: objeto({
    tenant_id: uuid,
    periodo,
    incluidas_anteriores: entero,
    incluidas: entero,
    actor_id: uuid,
  }),
  [EVENTOS_IDN.proveedorActualizado]: objeto({
    codigo: texto,
    prioridad: entero,
    ttl_dias: entero,
    timeout_ms: entero,
    activo: booleano,
    actor_id: uuid,
  }),
};

export function registrarEsquemasIdn(validador: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [tipoEvento, esquema] of Object.entries(ESQUEMAS_IDN)) validador.register(tipoEvento, 1, esquema);
}
