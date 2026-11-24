import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { AMBIENTES_EMISOR } from '../domain/estado-emisor.js';
import { EVENTOS_FE, VERSION_ESQUEMA_FE } from '../domain/eventos-fe.js';

// Ajv en modo estricto: sin `format` ni uniones de tipos en `type` (mismo criterio que cfg, org, seg, idn, per y arc).
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const ruc = { type: 'string', pattern: '^(10|15|17|20)[0-9]{9}$' };
const instante = { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{3})?Z$' };
const codigoProveedor = { type: 'string', minLength: 1, maxLength: 40 };
const cambioEstado = () => objeto({ emisor_id: uuid, empresa_id: uuid, proveedor: codigoProveedor });

const objeto = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** `additionalProperties: false` impide que entre el usuario, la clave, el token o la URL del proveedor, o algo del certificado. */
export const ESQUEMAS_FE: Readonly<Record<string, object>> = {
  [EVENTOS_FE.emisorConfigurado]: objeto({
    emisor_id: uuid,
    empresa_id: uuid,
    proveedor: codigoProveedor,
    ambiente: { type: 'string', enum: [...AMBIENTES_EMISOR] },
  }),
  [EVENTOS_FE.certificadoPorVencer]: objeto({
    emisor_id: uuid,
    empresa_id: uuid,
    ruc,
    vence_en: instante,
    dias_restantes: { type: 'integer' },
  }),
  [EVENTOS_FE.emisorVerificado]: cambioEstado(),
  [EVENTOS_FE.produccionHabilitada]: cambioEstado(),
  [EVENTOS_FE.pruebaSolicitada]: objeto({ emisor_id: uuid, numero_prueba: { type: 'integer', minimum: 1 } }),
};

export function registrarEsquemasFe(validador: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [tipoEvento, esquema] of Object.entries(ESQUEMAS_FE)) {
    validador.register(tipoEvento, VERSION_ESQUEMA_FE, esquema);
  }
}
