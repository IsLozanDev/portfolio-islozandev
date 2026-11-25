import type { Atributos } from './constructor-xml.js';

// Atributos de catálogo de la «Guía de elaboración de documentos electrónicos XML - UBL 2.1» de SUNAT (2017) y de
// las reglas de validación vigentes (tipo de operación en InvoiceTypeCode@listID, emisor en PartyLegalEntity).

export const NAMESPACES_INVOICE = {
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
} as const;
export const NAMESPACE_INVOICE = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';

export const VERSION_UBL = '2.1';
export const VERSION_ESTRUCTURA = '2.0';
/** Leyenda del monto en letras (cat. 52). */
export const CODIGO_LEYENDA_MONTO_EN_LETRAS = '1000';
/** Precio unitario con impuestos (cat. 16). */
export const TIPO_PRECIO_CON_IGV = '01';
export const PAIS_PERU = 'PE';
/** `cac:PaymentTerms/cbc:ID` de la forma de pago (RS 193-2020/SUNAT). */
export const ID_FORMA_PAGO = 'FormaPago';
export const MEDIO_PAGO_CONTADO = 'Contado';
export const MEDIO_PAGO_CREDITO = 'Credito';
export const PREFIJO_CUOTA = 'Cuota';
export const DIGITOS_CUOTA = 3;
/** El Id del `ds:Signature` y la referencia que lleva `cac:Signature`. */
export const ID_FIRMA = 'SignatureSP';

const AGENCIA_SUNAT = 'PE:SUNAT';
const AGENCIA_UNECE = 'United Nations Economic Commission for Europe';
const URN_CATALOGOS = 'urn:pe:gob:sunat:cpe:see:gem:catalogos';

export const ATRIBUTOS_VERSION_ESTRUCTURA: Atributos = { schemeAgencyName: AGENCIA_SUNAT };

export function atributosTipoDocumento(tipoOperacion: string): Atributos {
  return {
    listID: tipoOperacion,
    listAgencyName: AGENCIA_SUNAT,
    listName: 'Tipo de Documento',
    listURI: `${URN_CATALOGOS}:catalogo01`,
    name: 'Tipo de Operacion',
    listSchemeURI: `${URN_CATALOGOS}:catalogo51`,
  };
}

export const ATRIBUTOS_MONEDA: Atributos = { listID: 'ISO 4217 Alpha', listName: 'Currency', listAgencyName: AGENCIA_UNECE };

export function atributosDocumentoIdentidad(tipoDocumento: string): Atributos {
  return {
    schemeID: tipoDocumento,
    schemeName: 'Documento de Identidad',
    schemeAgencyName: AGENCIA_SUNAT,
    schemeURI: `${URN_CATALOGOS}:catalogo06`,
  };
}

export const ATRIBUTOS_UBIGEO: Atributos = { schemeName: 'Ubigeos', schemeAgencyName: 'PE:INEI' };
export const ATRIBUTOS_ESTABLECIMIENTO: Atributos = { listAgencyName: AGENCIA_SUNAT, listName: 'Establecimientos anexos' };
export const ATRIBUTOS_PAIS: Atributos = { listID: 'ISO 3166-1', listAgencyName: AGENCIA_UNECE, listName: 'Country' };

export const ATRIBUTOS_UNIDAD = { unitCodeListID: 'UN/ECE rec 20', unitCodeListAgencyName: AGENCIA_UNECE } as const;

export const ATRIBUTOS_TIPO_PRECIO: Atributos = {
  listName: 'Tipo de Precio',
  listAgencyName: AGENCIA_SUNAT,
  listURI: `${URN_CATALOGOS}:catalogo16`,
};

export const ATRIBUTOS_CATEGORIA_TRIBUTO: Atributos = {
  schemeID: 'UN/ECE 5305',
  schemeName: 'Tax Category Identifier',
  schemeAgencyName: AGENCIA_UNECE,
};

export const ATRIBUTOS_AFECTACION: Atributos = {
  listAgencyName: AGENCIA_SUNAT,
  listName: 'Afectacion del IGV',
  listURI: `${URN_CATALOGOS}:catalogo07`,
};

export const ATRIBUTOS_TRIBUTO: Atributos = {
  schemeName: 'Codigo de tributos',
  schemeAgencyName: AGENCIA_SUNAT,
  schemeURI: `${URN_CATALOGOS}:catalogo05`,
};

export function atributosMoneda(moneda: string): Atributos {
  return { currencyID: moneda };
}
