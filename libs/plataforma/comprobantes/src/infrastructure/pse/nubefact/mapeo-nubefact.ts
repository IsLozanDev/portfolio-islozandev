import type { FechaCalendario } from '@vitrina/plataforma/org';
import { redondearMonto, TASA_IGV, type DocumentoElectronico } from '../../../domain/documento-electronico.js';
import type { RespuestaPse } from '../../../domain/respuesta-pse.js';

// Contrato de la API JSON de Nubefact (manual «MANUAL DE INTEGRACIÓN ARCHIVO .JSON», v3.1, enlazado desde
// https://www.nubefact.com/integracion): operación `generar_comprobante`, fechas DD-MM-AAAA, montos con punto
// decimal, errores `{ errors, codigo }`.

export const OPERACION_GENERAR = 'generar_comprobante';
/** `tipo_de_comprobante` de Nubefact por tipo SUNAT (catálogo 01). */
const TIPO_NUBEFACT_POR_SUNAT: Readonly<Record<DocumentoElectronico['tipo'], number>> = { '03': 2 };
/** `moneda` de Nubefact: 1 = soles. */
const MONEDA_NUBEFACT_POR_ISO: Readonly<Record<DocumentoElectronico['moneda'], number>> = { PEN: 1 };
/** `sunat_transaction` 1 = venta interna. */
const VENTA_INTERNA = 1;
/** `tipo_de_igv` 1 = gravado, operación onerosa. */
const GRAVADO_ONEROSO = 1;
/** `unidad_de_medida` ZZ = servicio. */
const UNIDAD_SERVICIO = 'ZZ';
const PORCENTAJE = 100;
/** `sunat_responsecode` de un comprobante aceptado. */
const CODIGO_SUNAT_ACEPTADO = '0';
/** Códigos de error propios de Nubefact que son fallas de su lado: se reintentan. */
const CODIGOS_NUBEFACT_TECNICOS: ReadonlySet<number> = new Set([40]);

export interface ItemNubefact {
  unidad_de_medida: string;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  precio_unitario: number;
  subtotal: number;
  tipo_de_igv: number;
  igv: number;
  total: number;
  anticipo_regularizacion: boolean;
}

export interface ComprobanteNubefact {
  operacion: typeof OPERACION_GENERAR;
  tipo_de_comprobante: number;
  serie: string;
  numero: number;
  sunat_transaction: number;
  cliente_tipo_de_documento: string;
  cliente_numero_de_documento: string;
  cliente_denominacion: string;
  cliente_direccion: string;
  fecha_de_emision: string;
  moneda: number;
  porcentaje_de_igv: number;
  total_gravada: number;
  total_igv: number;
  total: number;
  enviar_automaticamente_a_la_sunat: boolean;
  enviar_automaticamente_al_cliente: boolean;
  items: ItemNubefact[];
}

/** Respuesta 200 de `generar_comprobante`; solo los campos que se usan. */
export interface RespuestaNubefact {
  aceptada_por_sunat?: boolean;
  sunat_description?: string | null;
  sunat_note?: string | null;
  sunat_responsecode?: string | null;
  sunat_soap_error?: string | null;
  codigo_hash?: string | null;
  enlace?: string | null;
  enlace_del_pdf?: string | null;
  enlace_del_xml?: string | null;
  enlace_del_cdr?: string | null;
}

/** Cuerpo de un error de Nubefact (HTTP 400 o 401). */
export interface ErrorNubefact {
  errors?: string;
  codigo?: number;
}

/** `2026-11-23` → `23-11-2026`. */
export function fechaNubefact(fecha: FechaCalendario): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}-${mes}-${anio}`;
}

export function comprobanteNubefact(documento: DocumentoElectronico): ComprobanteNubefact {
  const { adquirente, totales } = documento;
  return {
    operacion: OPERACION_GENERAR,
    tipo_de_comprobante: TIPO_NUBEFACT_POR_SUNAT[documento.tipo],
    serie: documento.serie,
    numero: documento.numero,
    sunat_transaction: VENTA_INTERNA,
    cliente_tipo_de_documento: adquirente.tipoDocumento,
    cliente_numero_de_documento: adquirente.numero,
    cliente_denominacion: adquirente.nombre,
    cliente_direccion: '',
    fecha_de_emision: fechaNubefact(documento.fechaEmision),
    moneda: MONEDA_NUBEFACT_POR_ISO[documento.moneda],
    porcentaje_de_igv: redondearMonto(TASA_IGV * PORCENTAJE),
    total_gravada: totales.gravada,
    total_igv: totales.igv,
    total: totales.total,
    enviar_automaticamente_a_la_sunat: true,
    enviar_automaticamente_al_cliente: false,
    items: documento.items.map((item) => ({
      unidad_de_medida: UNIDAD_SERVICIO,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      valor_unitario: item.valorUnitario,
      precio_unitario: item.total / item.cantidad,
      subtotal: redondearMonto(item.valorUnitario * item.cantidad),
      tipo_de_igv: GRAVADO_ONEROSO,
      igv: item.igv,
      total: item.total,
      anticipo_regularizacion: false,
    })),
  };
}

function textoONulo(valor: string | null | undefined): string | null {
  return valor === undefined || valor === null || valor === '' ? null : valor;
}

function enlacesDe(respuesta: RespuestaNubefact): Record<string, string> {
  const candidatos = { comprobante: respuesta.enlace, pdf: respuesta.enlace_del_pdf, xml: respuesta.enlace_del_xml, cdr: respuesta.enlace_del_cdr };
  return Object.fromEntries(Object.entries(candidatos).filter((par): par is [string, string] => textoONulo(par[1]) !== null));
}

/**
 * HTTP 200: aceptado (con observaciones si SUNAT dejó una nota), rechazado por SUNAT (código distinto de 0) o
 * EN_PROCESO si Nubefact lo registró pero SUNAT aún no responde.
 */
export function respuestaDesdeNubefact(respuesta: RespuestaNubefact): RespuestaPse {
  const nota = textoONulo(respuesta.sunat_note);
  const codigoSunat = textoONulo(respuesta.sunat_responsecode);
  const descripcionSunat = textoONulo(respuesta.sunat_description);
  const comun = { hash: textoONulo(respuesta.codigo_hash) ?? undefined, enlaces: enlacesDe(respuesta) };
  if (respuesta.aceptada_por_sunat === true) {
    const resultado = nota === null ? 'ACEPTADO' : 'ACEPTADO_CON_OBSERVACIONES';
    return { resultado, codigo: codigoSunat, descripcion: descripcionSunat, observaciones: nota === null ? [] : [nota], ...comun };
  }
  if (codigoSunat !== null && codigoSunat !== CODIGO_SUNAT_ACEPTADO) {
    return { resultado: 'RECHAZADO', codigo: codigoSunat, descripcion: descripcionSunat, observaciones: [], ...comun };
  }
  const descripcion = textoONulo(respuesta.sunat_soap_error) ?? descripcionSunat;
  return { resultado: 'EN_PROCESO', codigo: null, descripcion, observaciones: [], ...comun };
}

/** HTTP 400 o 401 con `{ errors, codigo }`: rechazo con su código, salvo el error interno de Nubefact (40). */
export function respuestaDesdeErrorNubefact(error: ErrorNubefact, estadoHttp: number): RespuestaPse {
  const codigo = error.codigo === undefined ? `HTTP_${estadoHttp}` : String(error.codigo);
  const resultado = error.codigo !== undefined && CODIGOS_NUBEFACT_TECNICOS.has(error.codigo) ? 'ERROR_TECNICO' : 'RECHAZADO';
  return { resultado, codigo, descripcion: textoONulo(error.errors), observaciones: [] };
}
