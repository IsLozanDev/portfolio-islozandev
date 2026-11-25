import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { PRODUCTOS } from '@vitrina/plataforma/org';
import { CANALES, FINALIDADES } from '../domain/consentimiento.js';
import { TIPOS_DOCUMENTO_PERSONA } from '../domain/documento-identidad.js';
import { CAMBIOS_PERSONA, EVENTOS_PER, VERSION_ESQUEMA_PER } from '../domain/eventos-per.js';
import { TIPOS_PERSONA } from '../domain/persona.js';
import { ROLES_PERSONA } from '../domain/rol-persona.js';

// Ajv en modo estricto: sin `format` ni uniones de tipos en `type` (mismo criterio que cfg, org, seg e idn).
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const fecha = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
/** `toISOString()`: siempre en UTC con milisegundos. */
const instante = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' };
const versionTexto = { type: 'string', pattern: '^[A-Za-z0-9._-]{1,20}$' };
const unoDe = (valores: readonly string[]) => ({ type: 'string', enum: [...valores] });

const objeto = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Esquemas de los eventos de personas. `additionalProperties: false` impide que entren datos personales. */
export const ESQUEMAS_PER: Readonly<Record<string, object>> = {
  [EVENTOS_PER.registrada]: objeto({
    persona_id: uuid,
    tipo_persona: unoDe(TIPOS_PERSONA),
    tipo_documento: unoDe(TIPOS_DOCUMENTO_PERSONA),
  }),
  [EVENTOS_PER.rolAsignado]: objeto({
    persona_id: uuid,
    producto_codigo: unoDe(PRODUCTOS),
    rol: unoDe(ROLES_PERSONA),
    desde: fecha,
  }),
  [EVENTOS_PER.actualizada]: objeto({
    persona_id: uuid,
    cambio: unoDe(CAMBIOS_PERSONA),
  }),
  [EVENTOS_PER.consentimientoRevocado]: objeto({
    persona_id: uuid,
    finalidad: unoDe(FINALIDADES),
    version_texto: versionTexto,
    canal: unoDe(CANALES),
    revocado_en: instante,
  }),
  [EVENTOS_PER.fusionada]: objeto({
    persona_conservada_id: uuid,
    persona_absorbida_id: uuid,
    fusion_id: uuid,
  }),
};

export function registrarEsquemasPer(validador: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [tipoEvento, esquema] of Object.entries(ESQUEMAS_PER)) {
    validador.register(tipoEvento, VERSION_ESQUEMA_PER, esquema);
  }
}
