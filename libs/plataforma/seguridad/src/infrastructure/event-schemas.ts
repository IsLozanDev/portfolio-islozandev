import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { EVENTOS_SEG } from '../domain/eventos.js';

// Ajv en modo estricto: sin `format` ni uniones de tipos en `type` (mismo criterio que org).
const texto = { type: 'string' };
const nulo = { type: 'null' };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const uuidNulo = { anyOf: [uuid, nulo] };
const fecha = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const textos = { type: 'array', items: texto };
const uuids = { type: 'array', items: uuid };

const objeto = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Esquemas de los eventos de seg, todos en schema_version 1. */
export const ESQUEMAS_SEG: Readonly<Record<string, object>> = {
  [EVENTOS_SEG.rolCreado]: objeto({ producto_codigo: texto, codigo: texto, nombre: texto, copiado_de: uuidNulo, permisos: textos }),
  [EVENTOS_SEG.rolPermisosCambiados]: objeto({ agregados: textos, quitados: textos }),
  [EVENTOS_SEG.rolInactivado]: objeto({ afectados: { type: 'integer', minimum: 0 } }),
  [EVENTOS_SEG.perfilCreado]: objeto({ codigo: texto, nombre: texto, roles: uuids }),
  [EVENTOS_SEG.perfilRolesCambiados]: objeto({ agregados: uuids, quitados: uuids }),
  [EVENTOS_SEG.asignacionOtorgada]: objeto({
    membresia_id: uuid,
    rol_id: uuidNulo,
    perfil_id: uuidNulo,
    alcance: { enum: ['TENANT', 'EMPRESA', 'SUCURSAL', 'UNIDAD'] },
    empresa_id: uuidNulo,
    sucursal_id: uuidNulo,
    unidad_id: uuidNulo,
    vigente_desde: fecha,
    vigente_hasta: { anyOf: [fecha, nulo] },
    otorgado_por: uuidNulo,
  }),
  [EVENTOS_SEG.asignacionRevocada]: objeto({ membresia_id: uuid, motivo: texto, por: uuid }),
  [EVENTOS_SEG.membresiaInvitada]: objeto({ usuario_id: uuid, invitado_por: uuid, reinvitacion: { type: 'boolean' }, expira_en: texto }),
  [EVENTOS_SEG.membresiaAceptada]: objeto({ usuario_id: uuid }),
  [EVENTOS_SEG.membresiaSuspendida]: objeto({ usuario_id: uuid, motivo: texto, por: uuid }),
  [EVENTOS_SEG.membresiaReactivada]: objeto({ usuario_id: uuid, motivo: texto, por: uuid }),
  [EVENTOS_SEG.membresiaFinalizada]: objeto({ usuario_id: uuid, motivo: texto, por: uuid, asignaciones_revocadas: uuids }),
};

export function registrarEsquemasSeg(validator: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [eventType, schema] of Object.entries(ESQUEMAS_SEG)) validator.register(eventType, 1, schema);
}
