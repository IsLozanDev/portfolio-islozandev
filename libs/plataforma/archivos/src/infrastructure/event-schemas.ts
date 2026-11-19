import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { CODIGOS_CATEGORIA } from '../domain/categoria.js';
import { EVENTOS_ARC, VERSION_ESQUEMA_ARC } from '../domain/eventos-arc.js';

// Ajv en modo estricto: sin `format` ni uniones de tipos en `type` (mismo criterio que cfg, org, seg, idn y per).
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const hashSha256 = { type: 'string', pattern: '^[0-9a-f]{64}$' };
const entidadTipo = { type: 'string', pattern: '^[A-Z][A-Z0-9_]{1,39}$' };
const entidadId = { type: 'string', minLength: 1, maxLength: 80 };
/** Largo máximo de los textos cortos de los eventos; el antivirus recorta la firma a este largo. */
export const LARGO_MAXIMO_TEXTO_CORTO = 100;
const textoCorto = { type: 'string', minLength: 1, maxLength: LARGO_MAXIMO_TEXTO_CORTO };
const enteroPositivo = { type: 'integer', minimum: 1 };

const objeto = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const referencia = {
  archivo_id: uuid,
  categoria: { type: 'string', enum: [...CODIGOS_CATEGORIA] },
  entidad_tipo: entidadTipo,
  entidad_id: entidadId,
};

/** Esquemas de los eventos de archivos. `additionalProperties: false` impide que entre el nombre original. */
export const ESQUEMAS_ARC: Readonly<Record<string, object>> = {
  [EVENTOS_ARC.disponible]: objeto({
    ...referencia,
    version: enteroPositivo,
    hash_sha256: hashSha256,
    bytes: enteroPositivo,
    mime_real: textoCorto,
  }),
  [EVENTOS_ARC.enCuarentena]: objeto({ ...referencia, firma: textoCorto }),
};

export function registrarEsquemasArc(validador: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [tipoEvento, esquema] of Object.entries(ESQUEMAS_ARC)) {
    validador.register(tipoEvento, VERSION_ESQUEMA_ARC, esquema);
  }
}
