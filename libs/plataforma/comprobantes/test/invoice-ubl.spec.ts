import { monto } from '../src/domain/comprobante/dinero.js';
import { documentoDesdeComprobante } from '../src/domain/comprobante/documento-desde-comprobante.js';
import type { DocumentoElectronico } from '../src/domain/documento-electronico.js';
import { generarInvoiceUbl } from '../src/infrastructure/sunat/ubl/invoice-ubl.js';
import { TRIBUTO_EXONERADO, TRIBUTO_IGV, TRIBUTO_INAFECTO, tributoDeAfectacion } from '../src/infrastructure/sunat/ubl/tributos-sunat.js';
import { comprobante, EMPRESA, ESTABLECIMIENTO, linea, RUC_ADQUIRENTE } from './support/comprobante-de-prueba.js';
import { consultasUbl } from './support/xpath-ubl.js';

const FACTURA = 'inv:Invoice';
const LINEA = `${FACTURA}/cac:InvoiceLine`;
const SUBTOTAL_DOCUMENTO = `${FACTURA}/cac:TaxTotal/cac:TaxSubtotal`;
const EMISOR = `${FACTURA}/cac:AccountingSupplierParty/cac:Party`;
const ADQUIRENTE = `${FACTURA}/cac:AccountingCustomerParty/cac:Party`;
const DIRECCION_EMISOR = `${EMISOR}/cac:PartyLegalEntity/cac:RegistrationAddress`;

function ubl(documento: DocumentoElectronico) {
  return consultasUbl(generarInvoiceUbl(documento));
}

const factura = () => documentoDesdeComprobante(comprobante(), EMPRESA, ESTABLECIMIENTO, '6');

describe('tributoDeAfectacion (cat. 07 → cat. 05)', () => {
  it.each([
    ['10', TRIBUTO_IGV],
    ['17', TRIBUTO_IGV],
    ['20', TRIBUTO_EXONERADO],
    ['21', TRIBUTO_EXONERADO],
    ['30', TRIBUTO_INAFECTO],
    ['37', TRIBUTO_INAFECTO],
  ])('%s → %o', (afectacion, tributo) => {
    expect(tributoDeAfectacion(afectacion)).toBe(tributo);
  });

  it('afectación fuera de los grupos onerosos → error de programación', () => {
    expect(() => tributoDeAfectacion('40')).toThrow('40');
  });
});

describe('generarInvoiceUbl', () => {
  it('TR-CA-136: cabecera de la factura F001-00000100 con listID 0101, leyenda 1000 y moneda', () => {
    const consulta = ubl(factura());
    expect(consulta.valor(`${FACTURA}/cbc:UBLVersionID`)).toBe('2.1');
    expect(consulta.valor(`${FACTURA}/cbc:CustomizationID`)).toBe('2.0');
    expect(consulta.valor(`${FACTURA}/cbc:ID`)).toBe('F001-00000100');
    expect(consulta.valor(`${FACTURA}/cbc:IssueDate`)).toBe('2026-11-24');
    expect(consulta.valor(`${FACTURA}/cbc:IssueTime`)).toBe('10:04:05');
    expect(consulta.valor(`${FACTURA}/cbc:InvoiceTypeCode`)).toBe('01');
    expect(consulta.valor(`${FACTURA}/cbc:InvoiceTypeCode/@listID`)).toBe('0101');
    expect(consulta.valor(`${FACTURA}/cbc:Note[@languageLocaleID="1000"]`)).toBe('CIENTO DIECIOCHO CON 00/100 SOLES');
    expect(consulta.valor(`${FACTURA}/cbc:DocumentCurrencyCode`)).toBe('PEN');
    expect(consulta.valor(`${FACTURA}/cbc:LineCountNumeric`)).toBe('2');
  });

  it('IGV 18.00, total 118.00 y la firma prevista en el primer ExtensionContent, vacío', () => {
    const consulta = ubl(factura());
    expect(consulta.valor(`${FACTURA}/cac:TaxTotal/cbc:TaxAmount`)).toBe('18.00');
    expect(consulta.valor(`${FACTURA}/cac:LegalMonetaryTotal/cbc:LineExtensionAmount`)).toBe('100.00');
    expect(consulta.valor(`${FACTURA}/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount`)).toBe('118.00');
    expect(consulta.valor(`${FACTURA}/cac:LegalMonetaryTotal/cbc:PayableAmount`)).toBe('118.00');
    expect(consulta.cuenta(`${FACTURA}/ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent`)).toBe(1);
    expect(consulta.cuenta(`${FACTURA}/ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/*`)).toBe(0);
    expect(consulta.valor(`${FACTURA}/cac:Signature/cac:DigitalSignatureAttachment/cac:ExternalReference/cbc:URI`)).toBe('#SignatureSP');
  });

  it('emisor: RUC con schemeID 6, razón social, nombre comercial, ubigeo, establecimiento y domicilio', () => {
    const consulta = ubl(factura());
    expect(consulta.valor(`${EMISOR}/cac:PartyIdentification/cbc:ID`)).toBe(EMPRESA.ruc);
    expect(consulta.valor(`${EMISOR}/cac:PartyIdentification/cbc:ID/@schemeID`)).toBe('6');
    expect(consulta.valor(`${EMISOR}/cac:PartyName/cbc:Name`)).toBe('EL SAZON');
    expect(consulta.valor(`${EMISOR}/cac:PartyLegalEntity/cbc:RegistrationName`)).toBe(EMPRESA.razonSocial);
    expect(consulta.valor(`${DIRECCION_EMISOR}/cbc:ID`)).toBe('150122');
    expect(consulta.valor(`${DIRECCION_EMISOR}/cbc:AddressTypeCode`)).toBe(ESTABLECIMIENTO);
    expect(consulta.valor(`${DIRECCION_EMISOR}/cac:AddressLine/cbc:Line`)).toBe(EMPRESA.domicilioFiscal);
    expect(consulta.valor(`${DIRECCION_EMISOR}/cac:Country/cbc:IdentificationCode`)).toBe('PE');
  });

  it('sin nombre comercial no lleva PartyName; el adquirente va con su RUC', () => {
    const documento = documentoDesdeComprobante(comprobante(), { ...EMPRESA, nombreComercial: null }, ESTABLECIMIENTO, '6');
    const consulta = ubl(documento);
    expect(consulta.cuenta(`${EMISOR}/cac:PartyName`)).toBe(0);
    expect(consulta.valor(`${ADQUIRENTE}/cac:PartyIdentification/cbc:ID`)).toBe(RUC_ADQUIRENTE);
    expect(consulta.valor(`${ADQUIRENTE}/cac:PartyIdentification/cbc:ID/@schemeID`)).toBe('6');
    expect(consulta.valor(`${ADQUIRENTE}/cac:PartyLegalEntity/cbc:RegistrationName`)).toBe('CLIENTE SAC');
  });

  it('boleta sin adquirente: InvoiceTypeCode 03 y CLIENTES VARIOS con documento 0', () => {
    const boleta = comprobante({ tipo: 'BOLETA', serie: 'B001', adquirente: null, lineas: [linea('1', '10')] }, 5);
    const consulta = ubl(documentoDesdeComprobante(boleta, EMPRESA, '0000', '0'));
    expect(consulta.valor(`${FACTURA}/cbc:InvoiceTypeCode`)).toBe('03');
    expect(consulta.valor(`${FACTURA}/cbc:ID`)).toBe('B001-00000005');
    expect(consulta.valor(`${ADQUIRENTE}/cac:PartyIdentification/cbc:ID/@schemeID`)).toBe('0');
    expect(consulta.valor(`${ADQUIRENTE}/cac:PartyIdentification/cbc:ID`)).toBe('0');
    expect(consulta.valor(`${ADQUIRENTE}/cac:PartyLegalEntity/cbc:RegistrationName`)).toBe('CLIENTES VARIOS');
    expect(consulta.valor(`${DIRECCION_EMISOR}/cbc:AddressTypeCode`)).toBe('0000');
  });

  it('gravado, exonerado e inafecto: un TaxSubtotal por tributo con su base y la afectación en cada línea', () => {
    const lineas = [linea('1', '100'), linea('1', '50', 'EXONERADO'), linea('2', '10', 'INAFECTO')];
    const consulta = ubl(documentoDesdeComprobante(comprobante({ lineas }), EMPRESA, ESTABLECIMIENTO, '6'));
    expect(consulta.valores(`${SUBTOTAL_DOCUMENTO}/cac:TaxCategory/cac:TaxScheme/cbc:ID`)).toEqual(['1000', '9997', '9998']);
    expect(consulta.valores(`${SUBTOTAL_DOCUMENTO}/cbc:TaxableAmount`)).toEqual(['100.00', '50.00', '20.00']);
    expect(consulta.valores(`${SUBTOTAL_DOCUMENTO}/cbc:TaxAmount`)).toEqual(['18.00', '0.00', '0.00']);
    expect(consulta.valores(`${SUBTOTAL_DOCUMENTO}/cac:TaxCategory/cac:TaxScheme/cbc:Name`)).toEqual(['IGV', 'EXO', 'INA']);
    expect(consulta.valores(`${SUBTOTAL_DOCUMENTO}/cac:TaxCategory/cbc:ID`)).toEqual(['S', 'E', 'O']);
    const categoriaLinea = `${LINEA}/cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory`;
    expect(consulta.valores(`${categoriaLinea}/cbc:TaxExemptionReasonCode`)).toEqual(['10', '20', '30']);
    expect(consulta.valores(`${categoriaLinea}/cac:TaxScheme/cbc:ID`)).toEqual(['1000', '9997', '9998']);
    expect(consulta.valores(`${categoriaLinea}/cbc:Percent`)).toEqual(['18.00', '0.00', '0.00']);
  });

  it('solo gravado: un único TaxSubtotal de IGV', () => {
    expect(ubl(factura()).valores(`${SUBTOTAL_DOCUMENTO}/cac:TaxCategory/cac:TaxScheme/cbc:ID`)).toEqual(['1000']);
  });

  it('línea: cantidad con unitCode, valor de venta, precio con IGV (tipo 01), valor unitario, descripción y código', () => {
    const consulta = ubl(factura());
    const primera = `${LINEA}[1]`;
    expect(consulta.valor(`${primera}/cbc:ID`)).toBe('1');
    expect(consulta.valor(`${primera}/cbc:InvoicedQuantity`)).toBe('1.0000');
    expect(consulta.valor(`${primera}/cbc:InvoicedQuantity/@unitCode`)).toBe('NIU');
    expect(consulta.valor(`${primera}/cbc:LineExtensionAmount`)).toBe('60.00');
    expect(consulta.valor(`${primera}/cac:PricingReference/cac:AlternativeConditionPrice/cbc:PriceAmount`)).toBe('70.8000');
    expect(consulta.valor(`${primera}/cac:PricingReference/cac:AlternativeConditionPrice/cbc:PriceTypeCode`)).toBe('01');
    expect(consulta.valor(`${primera}/cac:TaxTotal/cbc:TaxAmount`)).toBe('10.80');
    expect(consulta.valor(`${primera}/cac:Item/cbc:Description`)).toBe('Lomo saltado');
    expect(consulta.valor(`${primera}/cac:Item/cac:SellersItemIdentification/cbc:ID`)).toBe('P-1');
    expect(consulta.valor(`${primera}/cac:Price/cbc:PriceAmount`)).toBe('60.0000');
  });

  it('contado: PaymentTerms FormaPago/Contado, sin monto ni cuotas', () => {
    const consulta = ubl(factura());
    expect(consulta.valores(`${FACTURA}/cac:PaymentTerms/cbc:PaymentMeansID`)).toEqual(['Contado']);
    expect(consulta.valor(`${FACTURA}/cac:PaymentTerms/cbc:ID`)).toBe('FormaPago');
    expect(consulta.cuenta(`${FACTURA}/cac:PaymentTerms/cbc:Amount`)).toBe(0);
  });

  it('crédito con dos cuotas: Credito con el monto pendiente y Cuota001, Cuota002 con monto y fecha', () => {
    const cuotas = [
      { numero: 1, monto: monto('59', 'monto'), fechaVencimiento: '2026-12-24' },
      { numero: 2, monto: monto('59', 'monto'), fechaVencimiento: '2027-01-24' },
    ];
    const consulta = ubl(documentoDesdeComprobante(comprobante({ formaPago: 'CREDITO', cuotas }), EMPRESA, ESTABLECIMIENTO, '6'));
    const terminos = `${FACTURA}/cac:PaymentTerms`;
    expect(consulta.valores(`${terminos}/cbc:ID`)).toEqual(['FormaPago', 'FormaPago', 'FormaPago']);
    expect(consulta.valores(`${terminos}/cbc:PaymentMeansID`)).toEqual(['Credito', 'Cuota001', 'Cuota002']);
    expect(consulta.valores(`${terminos}/cbc:Amount`)).toEqual(['118.00', '59.00', '59.00']);
    expect(consulta.valores(`${terminos}/cbc:PaymentDueDate`)).toEqual(['2026-12-24', '2027-01-24']);
  });

  it('cada importe lleva currencyID con la moneda del documento', () => {
    const consulta = ubl(documentoDesdeComprobante(comprobante({ moneda: 'USD' }), EMPRESA, ESTABLECIMIENTO, '6'));
    const importes = consulta.nodos('//cbc:*[contains(local-name(), "Amount")]');
    expect(importes.length).toBeGreaterThan(10);
    expect(consulta.cuenta('//cbc:*[contains(local-name(), "Amount")][not(@currencyID="USD")]')).toBe(0);
  });

  it('escapa & y < de descripciones y nombres', () => {
    const conCaracteres = comprobante({ lineas: [{ ...linea('1', '10'), descripcion: 'Pollo & papas <grande>' }] });
    const xml = generarInvoiceUbl(documentoDesdeComprobante(conCaracteres, { ...EMPRESA, razonSocial: 'K&G SAC' }, ESTABLECIMIENTO, '6'));
    expect(xml).toContain('Pollo &amp; papas &lt;grande&gt;');
    expect(consultasUbl(xml).valor(`${LINEA}/cac:Item/cbc:Description`)).toBe('Pollo & papas <grande>');
    expect(consultasUbl(xml).valor(`${EMISOR}/cac:PartyLegalEntity/cbc:RegistrationName`)).toBe('K&G SAC');
  });

  it('declara UTF-8 y los prefijos en la raíz', () => {
    const xml = generarInvoiceUbl(factura());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    const raiz = /^<\?xml[^>]*\?><Invoice ([^>]*)>/.exec(xml)?.[1] ?? '';
    expect(raiz).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
    for (const prefijo of ['cac', 'cbc', 'ext', 'ds']) expect(raiz).toContain(`xmlns:${prefijo}=`);
  });
});
