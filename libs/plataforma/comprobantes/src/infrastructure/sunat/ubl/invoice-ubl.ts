import type { Element } from '@xmldom/xmldom';
import { Decimal, ESCALA_MONTO, ESCALA_TASA } from '../../../domain/comprobante/dinero.js';
import { formatearNumero } from '../../../domain/comprobante/tipo-comprobante.js';
import type { DocumentoElectronico, LineaDocumento, TotalesDocumento } from '../../../domain/documento-electronico.js';
import {
  ATRIBUTOS_AFECTACION,
  ATRIBUTOS_CATEGORIA_TRIBUTO,
  ATRIBUTOS_ESTABLECIMIENTO,
  ATRIBUTOS_MONEDA,
  ATRIBUTOS_PAIS,
  ATRIBUTOS_TIPO_PRECIO,
  ATRIBUTOS_TRIBUTO,
  ATRIBUTOS_UBIGEO,
  ATRIBUTOS_UNIDAD,
  ATRIBUTOS_VERSION_ESTRUCTURA,
  atributosDocumentoIdentidad,
  atributosMoneda,
  atributosTipoDocumento,
  CODIGO_LEYENDA_MONTO_EN_LETRAS,
  DIGITOS_CUOTA,
  ID_FIRMA,
  ID_FORMA_PAGO,
  MEDIO_PAGO_CONTADO,
  MEDIO_PAGO_CREDITO,
  NAMESPACE_INVOICE,
  NAMESPACES_INVOICE,
  PAIS_PERU,
  PREFIJO_CUOTA,
  TIPO_PRECIO_CON_IGV,
  VERSION_ESTRUCTURA,
  VERSION_UBL,
} from './atributos-ubl.js';
import { ConstructorXml, type Atributos } from './constructor-xml.js';
import { TRIBUTO_EXONERADO, TRIBUTO_IGV, TRIBUTO_INAFECTO, TRIBUTOS_EMITIDOS, tributoDeAfectacion, type TributoSunat } from './tributos-sunat.js';

const RAIZ = 'Invoice';
const CIEN_POR_CIENTO = Decimal.desdeTexto('100', ESCALA_TASA, 'porcentaje');
const PORCENTAJE_SIN_IGV = '0.00';
const SIN_IMPUESTO = '0.00';
/** Cat. 06: el emisor siempre se identifica con RUC. */
const TIPO_DOCUMENTO_RUC = '6';

const BASE_DEL_TRIBUTO: ReadonlyMap<TributoSunat, keyof TotalesDocumento> = new Map([
  [TRIBUTO_IGV, 'gravado'],
  [TRIBUTO_EXONERADO, 'exonerado'],
  [TRIBUTO_INAFECTO, 'inafecto'],
]);

function porcentajeIgv(tasaIgv: string): string {
  return Decimal.desdeTexto(tasaIgv, ESCALA_TASA, 'tasaIgv').multiplicar(CIEN_POR_CIENTO, ESCALA_MONTO).aTexto();
}

/**
 * `Invoice` UBL 2.1 de factura (01) o boleta (03), sin firmar: el primer `ext:ExtensionContent` queda vacío para la
 * firma. Se arma con DOM, nunca concatenando texto.
 */
export function generarInvoiceUbl(documento: DocumentoElectronico): string {
  return new GeneradorInvoice(documento).generar();
}

class GeneradorInvoice {
  private readonly xml = new ConstructorXml(NAMESPACE_INVOICE, RAIZ, NAMESPACES_INVOICE);
  private readonly moneda: Atributos;

  constructor(private readonly documento: DocumentoElectronico) {
    this.moneda = atributosMoneda(documento.moneda);
  }

  generar(): string {
    const raiz = this.xml.raiz;
    this.agregarExtensiones(raiz);
    this.agregarCabecera(raiz);
    this.agregarReferenciaFirma(raiz);
    this.agregarEmisor(raiz);
    this.agregarAdquirente(raiz);
    this.agregarFormaPago(raiz);
    this.agregarTotalTributos(raiz);
    this.agregarTotales(raiz);
    this.documento.lineas.forEach((linea) => this.agregarLinea(raiz, linea));
    return this.xml.serializar();
  }

  private importe(padre: Element, nombre: string, monto: string): void {
    this.xml.agregar(padre, nombre, monto, this.moneda);
  }

  private agregarExtensiones(raiz: Element): void {
    const extension = this.xml.agregar(this.xml.agregar(raiz, 'ext:UBLExtensions'), 'ext:UBLExtension');
    this.xml.agregar(extension, 'ext:ExtensionContent');
  }

  private agregarCabecera(raiz: Element): void {
    const { tipo, serie, numero, fechaEmision, horaEmision, tipoOperacion, montoEnLetras, moneda, lineas } = this.documento;
    this.xml.agregar(raiz, 'cbc:UBLVersionID', VERSION_UBL);
    this.xml.agregar(raiz, 'cbc:CustomizationID', VERSION_ESTRUCTURA, ATRIBUTOS_VERSION_ESTRUCTURA);
    this.xml.agregar(raiz, 'cbc:ID', formatearNumero(serie, numero));
    this.xml.agregar(raiz, 'cbc:IssueDate', fechaEmision);
    this.xml.agregar(raiz, 'cbc:IssueTime', horaEmision);
    this.xml.agregar(raiz, 'cbc:InvoiceTypeCode', tipo, atributosTipoDocumento(tipoOperacion));
    this.xml.agregar(raiz, 'cbc:Note', montoEnLetras, { languageLocaleID: CODIGO_LEYENDA_MONTO_EN_LETRAS });
    this.xml.agregar(raiz, 'cbc:DocumentCurrencyCode', moneda, ATRIBUTOS_MONEDA);
    this.xml.agregar(raiz, 'cbc:LineCountNumeric', String(lineas.length));
  }

  private agregarReferenciaFirma(raiz: Element): void {
    const { ruc, razonSocial } = this.documento.emisor;
    const firma = this.xml.agregar(raiz, 'cac:Signature');
    this.xml.agregar(firma, 'cbc:ID', ID_FIRMA);
    const firmante = this.xml.agregar(firma, 'cac:SignatoryParty');
    this.xml.agregar(this.xml.agregar(firmante, 'cac:PartyIdentification'), 'cbc:ID', ruc);
    this.xml.agregar(this.xml.agregar(firmante, 'cac:PartyName'), 'cbc:Name', razonSocial);
    const adjunto = this.xml.agregar(firma, 'cac:DigitalSignatureAttachment');
    this.xml.agregar(this.xml.agregar(adjunto, 'cac:ExternalReference'), 'cbc:URI', `#${ID_FIRMA}`);
  }

  private agregarEmisor(raiz: Element): void {
    const { ruc, razonSocial, nombreComercial, ubigeo, codigoEstablecimiento, domicilioFiscal } = this.documento.emisor;
    const parte = this.xml.agregar(this.xml.agregar(raiz, 'cac:AccountingSupplierParty'), 'cac:Party');
    this.xml.agregar(this.xml.agregar(parte, 'cac:PartyIdentification'), 'cbc:ID', ruc, atributosDocumentoIdentidad(TIPO_DOCUMENTO_RUC));
    if (nombreComercial !== null) this.xml.agregar(this.xml.agregar(parte, 'cac:PartyName'), 'cbc:Name', nombreComercial);
    const entidad = this.xml.agregar(parte, 'cac:PartyLegalEntity');
    this.xml.agregar(entidad, 'cbc:RegistrationName', razonSocial);
    const direccion = this.xml.agregar(entidad, 'cac:RegistrationAddress');
    this.xml.agregar(direccion, 'cbc:ID', ubigeo, ATRIBUTOS_UBIGEO);
    this.xml.agregar(direccion, 'cbc:AddressTypeCode', codigoEstablecimiento, ATRIBUTOS_ESTABLECIMIENTO);
    this.xml.agregar(this.xml.agregar(direccion, 'cac:AddressLine'), 'cbc:Line', domicilioFiscal);
    this.xml.agregar(this.xml.agregar(direccion, 'cac:Country'), 'cbc:IdentificationCode', PAIS_PERU, ATRIBUTOS_PAIS);
  }

  private agregarAdquirente(raiz: Element): void {
    const { tipoDocumento, numero, nombre } = this.documento.adquirente;
    const parte = this.xml.agregar(this.xml.agregar(raiz, 'cac:AccountingCustomerParty'), 'cac:Party');
    this.xml.agregar(this.xml.agregar(parte, 'cac:PartyIdentification'), 'cbc:ID', numero, atributosDocumentoIdentidad(tipoDocumento));
    this.xml.agregar(this.xml.agregar(parte, 'cac:PartyLegalEntity'), 'cbc:RegistrationName', nombre);
  }

  /** Contado: un nodo. Crédito: el monto pendiente y una `CuotaNNN` por cuota con su vencimiento. */
  private agregarFormaPago(raiz: Element): void {
    const { formaPago, cuotas, totales } = this.documento;
    const terminos = this.xml.agregar(raiz, 'cac:PaymentTerms');
    this.xml.agregar(terminos, 'cbc:ID', ID_FORMA_PAGO);
    if (formaPago === 'CONTADO') {
      this.xml.agregar(terminos, 'cbc:PaymentMeansID', MEDIO_PAGO_CONTADO);
      return;
    }
    this.xml.agregar(terminos, 'cbc:PaymentMeansID', MEDIO_PAGO_CREDITO);
    this.importe(terminos, 'cbc:Amount', totales.total);
    for (const cuota of cuotas) {
      const terminosCuota = this.xml.agregar(raiz, 'cac:PaymentTerms');
      this.xml.agregar(terminosCuota, 'cbc:ID', ID_FORMA_PAGO);
      this.xml.agregar(terminosCuota, 'cbc:PaymentMeansID', `${PREFIJO_CUOTA}${String(cuota.numero).padStart(DIGITOS_CUOTA, '0')}`);
      this.importe(terminosCuota, 'cbc:Amount', cuota.monto);
      this.xml.agregar(terminosCuota, 'cbc:PaymentDueDate', cuota.fechaVencimiento);
    }
  }

  private agregarTributo(categoria: Element, tributo: TributoSunat): void {
    const esquema = this.xml.agregar(categoria, 'cac:TaxScheme');
    this.xml.agregar(esquema, 'cbc:ID', tributo.codigo, ATRIBUTOS_TRIBUTO);
    this.xml.agregar(esquema, 'cbc:Name', tributo.nombre);
    this.xml.agregar(esquema, 'cbc:TaxTypeCode', tributo.tipo);
  }

  /** Un TaxSubtotal por tributo con al menos una línea, con la base de su afectación. */
  private agregarTotalTributos(raiz: Element): void {
    const { totales, lineas } = this.documento;
    const presentes = new Set(lineas.map((linea) => tributoDeAfectacion(linea.afectacionIgv)));
    const totalTributos = this.xml.agregar(raiz, 'cac:TaxTotal');
    this.importe(totalTributos, 'cbc:TaxAmount', totales.igv);
    for (const tributo of TRIBUTOS_EMITIDOS.filter((candidato) => presentes.has(candidato))) {
      const subtotal = this.xml.agregar(totalTributos, 'cac:TaxSubtotal');
      this.importe(subtotal, 'cbc:TaxableAmount', totales[BASE_DEL_TRIBUTO.get(tributo) ?? 'gravado']);
      this.importe(subtotal, 'cbc:TaxAmount', tributo === TRIBUTO_IGV ? totales.igv : SIN_IMPUESTO);
      const categoria = this.xml.agregar(subtotal, 'cac:TaxCategory');
      this.xml.agregar(categoria, 'cbc:ID', tributo.categoria, ATRIBUTOS_CATEGORIA_TRIBUTO);
      this.agregarTributo(categoria, tributo);
    }
  }

  private agregarTotales(raiz: Element): void {
    const { gravado, exonerado, inafecto, total } = this.documento.totales;
    const valorVenta = [gravado, exonerado, inafecto]
      .reduce((suma, monto) => suma.sumar(Decimal.desdeTexto(monto, ESCALA_MONTO, 'monto')), Decimal.cero(ESCALA_MONTO))
      .aTexto();
    const totales = this.xml.agregar(raiz, 'cac:LegalMonetaryTotal');
    this.importe(totales, 'cbc:LineExtensionAmount', valorVenta);
    this.importe(totales, 'cbc:TaxInclusiveAmount', total);
    this.importe(totales, 'cbc:PayableAmount', total);
  }

  private agregarLinea(raiz: Element, linea: LineaDocumento): void {
    const item = this.xml.agregar(raiz, 'cac:InvoiceLine');
    this.xml.agregar(item, 'cbc:ID', String(linea.orden));
    this.xml.agregar(item, 'cbc:InvoicedQuantity', linea.cantidad, { unitCode: linea.unidad, ...ATRIBUTOS_UNIDAD });
    this.importe(item, 'cbc:LineExtensionAmount', linea.valorVenta);
    const precio = this.xml.agregar(this.xml.agregar(item, 'cac:PricingReference'), 'cac:AlternativeConditionPrice');
    this.importe(precio, 'cbc:PriceAmount', linea.precioUnitario);
    this.xml.agregar(precio, 'cbc:PriceTypeCode', TIPO_PRECIO_CON_IGV, ATRIBUTOS_TIPO_PRECIO);
    this.agregarTributoLinea(item, linea);
    const producto = this.xml.agregar(item, 'cac:Item');
    this.xml.agregar(producto, 'cbc:Description', linea.descripcion);
    if (linea.codigo !== null) this.xml.agregar(this.xml.agregar(producto, 'cac:SellersItemIdentification'), 'cbc:ID', linea.codigo);
    this.importe(this.xml.agregar(item, 'cac:Price'), 'cbc:PriceAmount', linea.valorUnitario);
  }

  private agregarTributoLinea(item: Element, linea: LineaDocumento): void {
    const tributo = tributoDeAfectacion(linea.afectacionIgv);
    const totalTributos = this.xml.agregar(item, 'cac:TaxTotal');
    this.importe(totalTributos, 'cbc:TaxAmount', linea.igv);
    const subtotal = this.xml.agregar(totalTributos, 'cac:TaxSubtotal');
    this.importe(subtotal, 'cbc:TaxableAmount', linea.valorVenta);
    this.importe(subtotal, 'cbc:TaxAmount', linea.igv);
    const categoria = this.xml.agregar(subtotal, 'cac:TaxCategory');
    this.xml.agregar(categoria, 'cbc:ID', tributo.categoria, ATRIBUTOS_CATEGORIA_TRIBUTO);
    this.xml.agregar(categoria, 'cbc:Percent', tributo === TRIBUTO_IGV ? porcentajeIgv(this.documento.tasaIgv) : PORCENTAJE_SIN_IGV);
    this.xml.agregar(categoria, 'cbc:TaxExemptionReasonCode', linea.afectacionIgv, ATRIBUTOS_AFECTACION);
    this.agregarTributo(categoria, tributo);
  }
}
