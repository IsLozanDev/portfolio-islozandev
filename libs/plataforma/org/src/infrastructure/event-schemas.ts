import type { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';

// Ajv en modo estricto: sin `format` (no carga ajv-formats) ni uniones de tipos en `type`.
const texto = { type: 'string' };
const nulo = { type: 'null' };
const textoNulo = { anyOf: [texto, nulo] };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const enteroNulo = { anyOf: [{ type: 'integer', minimum: 1 }, nulo] };
const estadoTenant = { enum: ['PRUEBA', 'ACTIVO', 'SUSPENDIDO', 'BAJA'] };
const productoCodigo = { enum: ['REST', 'PSI', 'COL', 'LIB', 'GYM', 'CLI', 'DOC', 'ECO', 'LEX'] };
const fecha = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };

const objeto = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const cambioEstado = objeto({ estado_anterior: estadoTenant, motivo: texto, fecha_efectiva: texto });
const empresa = objeto({ ruc: { type: 'string', pattern: '^\\d{11}$' }, razon_social: texto, nombre_comercial: textoNulo });
const sucursal = objeto({
  empresa_id: uuid,
  codigo: texto,
  nombre: texto,
  es_principal: { type: 'boolean' },
  codigo_establecimiento_sunat: textoNulo,
});
const unidad = objeto({ empresa_id: uuid, sucursal_id: { anyOf: [uuid, nulo] }, tipo: texto, codigo: texto });

/** Esquemas de los eventos de org, todos en schema_version 1. */
export const ESQUEMAS_ORG: Readonly<Record<string, object>> = {
  'tenant.creado': objeto({ codigo: texto, nombre: texto, estado: estadoTenant }),
  'tenant.suspendido': cambioEstado,
  'tenant.reactivado': cambioEstado,
  'tenant.dado_de_baja': cambioEstado,
  'suscripcion.cambiada': objeto({
    producto_codigo: productoCodigo,
    plan: { enum: ['BASICO', 'PRO', 'EMPRESA'] },
    estado: { enum: ['PRUEBA', 'ACTIVA', 'VENCIDA', 'CANCELADA'] },
    limite_sucursales: enteroNulo,
    limite_usuarios: enteroNulo,
    vigente_hasta: textoNulo,
    nueva: { type: 'boolean' },
  }),
  'suscripcion.por_vencer': objeto({ producto_codigo: productoCodigo, vigente_hasta: fecha, dias_antes: { enum: [7, 3, 1] } }),
  'suscripcion.vencida': objeto({
    producto_codigo: productoCodigo,
    vigente_hasta: fecha,
    estado_anterior: { enum: ['PRUEBA', 'ACTIVA'] },
  }),
  'empresa.creada': empresa,
  'empresa.actualizada': empresa,
  'sucursal.creada': sucursal,
  'sucursal.actualizada': sucursal,
  'sucursal.inactivada': sucursal,
  'unidad.creada': unidad,
  'unidad.actualizada': unidad,
  'unidad.inactivada': unidad,
};

export function registrarEsquemasOrg(validator: Pick<InMemoryEventSchemaValidator, 'register'>): void {
  for (const [eventType, schema] of Object.entries(ESQUEMAS_ORG)) validator.register(eventType, 1, schema);
}
