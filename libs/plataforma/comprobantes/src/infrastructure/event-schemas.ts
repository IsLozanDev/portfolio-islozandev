import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { CODIGO_SUNAT_POR_TIPO, ESTADOS_COMPROBANTE, MONEDAS } from '../domain/comprobante/tipo-comprobante.js';
import { AMBIENTES_EMISOR } from '../domain/estado-emisor.js';
import { EVENTOS_FE, VERSION_ESQUEMA_FE } from '../domain/eventos-fe.js';

// Ajv en modo estricto: sin `format` ni uniones de tipos en `type` (mismo criterio que cfg, org, seg, idn, per y arc).
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const ruc = { type: 'string', pattern: '^(10|15|17|20)[0-9]{9}$' };
const instante = { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{3})?Z$' };
const codigoProveedor = { type: 'string', minLength: 1, maxLength: 40 };
const nulo = { type: 'null' };
/** El CHECK de fe.comprobante.numero. */
const NUMERO_MAXIMO_COMPROBANTE = 99_999_999;
const cambioEstado = () => objeto({ emisor_id: uuid, empresa_id: uuid, proveedor: codigoProveedor });
const textoONulo = (maximo: number) => ({ anyOf: [{ type: 'string', maxLength: maximo }, nulo] });
const uuidONulo = { anyOf: [uuid, nulo] };
/** Los largos de las columnas de respuesta de 01x. */
const LARGO_MAXIMO_CODIGO_RESPUESTA = 10;
const LARGO_MAXIMO_DESCRIPCION_RESPUESTA = 500;

/** Lo que comparten los eventos del comprobante; `estados` limita el estado que puede traer cada uno. */
function cargaComprobante(estados: readonly string[] = ESTADOS_COMPROBANTE): Record<string, object> {
  return {
    comprobante_id: uuid,
    tipo: { type: 'string', enum: Object.values(CODIGO_SUNAT_POR_TIPO) },
    serie: { type: 'string', pattern: '^[FB][A-Z0-9]{3}$' },
    numero: { type: 'integer', minimum: 1, maximum: NUMERO_MAXIMO_COMPROBANTE },
    total: { type: 'string', pattern: '^[0-9]+\\.[0-9]{2}$' },
    moneda: { type: 'string', enum: [...MONEDAS] },
    estado: { type: 'string', enum: [...estados] },
    origen_producto: { anyOf: [{ type: 'string', minLength: 1, maxLength: 10 }, nulo] },
    origen_id: { anyOf: [{ type: 'string', minLength: 1, maxLength: 100 }, nulo] },
  };
}

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
  // Sin campos del adquirente (TR-RNF-026): additionalProperties: false los rechaza.
  [EVENTOS_FE.comprobanteEmitido]: objeto(cargaComprobante()),
  [EVENTOS_FE.comprobanteAceptado]: objeto({
    ...cargaComprobante(['ACEPTADO', 'ACEPTADO_CON_OBSERVACIONES']),
    codigo_respuesta: textoONulo(LARGO_MAXIMO_CODIGO_RESPUESTA),
    observaciones: { type: 'array', items: { type: 'string' } },
    xml_archivo_id: uuidONulo,
    cdr_archivo_id: uuidONulo,
  }),
  [EVENTOS_FE.comprobanteRechazado]: objeto({
    ...cargaComprobante(['RECHAZADO']),
    codigo_respuesta: textoONulo(LARGO_MAXIMO_CODIGO_RESPUESTA),
    descripcion_respuesta: textoONulo(LARGO_MAXIMO_DESCRIPCION_RESPUESTA),
    xml_archivo_id: uuidONulo,
  }),
};

export function registrarEsquemasFe(validador: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [tipoEvento, esquema] of Object.entries(ESQUEMAS_FE)) {
    validador.register(tipoEvento, VERSION_ESQUEMA_FE, esquema);
  }
}
