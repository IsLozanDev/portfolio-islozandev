import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { documentoDesdeComprobante } from '../src/domain/comprobante/documento-desde-comprobante.js';
import { ClaveCertificadoIncorrectaError } from '../src/domain/errores.js';
import {
  ALGORITMO_DIGEST,
  ALGORITMO_FIRMA,
  CANONICALIZACION_C14N_INCLUSIVA,
  firmarXml,
  TRANSFORMACION_ENVELOPED,
} from '../src/infrastructure/sunat/firma/firmador-xml.js';
import { llaveDesdePfx } from '../src/infrastructure/sunat/firma/llave-desde-pfx.js';
import { generarXmlFirmado } from '../src/infrastructure/sunat/generar-xml-firmado.js';
import { generarInvoiceUbl } from '../src/infrastructure/sunat/ubl/invoice-ubl.js';
import { CLAVE_PFX, crearPfx } from './support/certificados.js';
import { comprobante, EMPRESA, ESTABLECIMIENTO } from './support/comprobante-de-prueba.js';
import { consultasUbl } from './support/xpath-ubl.js';

const AHORA = new Date('2026-11-24T15:00:00Z');
const FIRMA = 'inv:Invoice/ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/ds:Signature';
const NAMESPACE_DS = 'http://www.w3.org/2000/09/xmldsig#';
const CUERPO_PEM = /-----BEGIN [A-Z ]+-----\r?\n([\s\S]+?)\r?\n-----END/;

const pfx = crearPfx(AHORA);
const llave = llaveDesdePfx(pfx, CLAVE_PFX);
const documento = documentoDesdeComprobante(comprobante(), EMPRESA, ESTABLECIMIENTO, '6');

function cuerpoPem(pem: string): string {
  return (CUERPO_PEM.exec(pem)?.[1] ?? '').replace(/\s/g, '');
}

/** Verifica con xml-crypto y el certificado del .pfx; una firma inválida da false. */
function verifica(xmlFirmado: string, certificadoPem: string): boolean {
  const documentoFirmado = new DOMParser().parseFromString(xmlFirmado, 'text/xml');
  const [firma] = Array.from(documentoFirmado.getElementsByTagNameNS(NAMESPACE_DS, 'Signature'));
  const verificador = new SignedXml({ publicCert: certificadoPem });
  verificador.loadSignature(firma as unknown as Node);
  try {
    return verificador.checkSignature(xmlFirmado);
  } catch {
    return false;
  }
}

describe('llaveDesdePfx', () => {
  it('devuelve la llave privada y el certificado hoja en PEM', () => {
    expect(llave.llavePrivadaPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/);
    expect(llave.certificadoPem).toMatch(/^-----BEGIN CERTIFICATE-----/);
  });

  it('una clave incorrecta lanza el error del 49 sin la clave en el mensaje', () => {
    const claveIncorrecta = 'clave-equivocada-987';
    expect(() => llaveDesdePfx(pfx, claveIncorrecta)).toThrow(ClaveCertificadoIncorrectaError);
    try {
      llaveDesdePfx(pfx, claveIncorrecta);
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(claveIncorrecta);
      expect(JSON.stringify(error)).not.toContain(claveIncorrecta);
    }
  });
});

describe('firmarXml', () => {
  const { xmlFirmado, hash } = firmarXml(generarInvoiceUbl(documento), llave);
  const consulta = consultasUbl(xmlFirmado);

  it('el XML firmado verifica con xml-crypto y el certificado del .pfx', () => {
    expect(verifica(xmlFirmado, llave.certificadoPem)).toBe(true);
  });

  it('alterar un importe después de firmar hace fallar la verificación', () => {
    const alterado = xmlFirmado.replace('<cbc:PayableAmount currencyID="PEN">118.00<', '<cbc:PayableAmount currencyID="PEN">119.00<');
    expect(alterado).not.toBe(xmlFirmado);
    expect(verifica(alterado, llave.certificadoPem)).toBe(false);
  });

  it('otro certificado no verifica la firma', () => {
    expect(verifica(xmlFirmado, llaveDesdePfx(crearPfx(AHORA), CLAVE_PFX).certificadoPem)).toBe(false);
  });

  it('va dentro de UBLExtensions/UBLExtension/ExtensionContent, con el Id que referencia cac:Signature', () => {
    expect(consulta.cuenta(FIRMA)).toBe(1);
    expect(consulta.cuenta('//ds:Signature')).toBe(1);
    expect(consulta.valor(`${FIRMA}/@Id`)).toBe('SignatureSP');
    expect(consulta.valor('inv:Invoice/cac:Signature/cac:DigitalSignatureAttachment/cac:ExternalReference/cbc:URI')).toBe('#SignatureSP');
  });

  it('enveloped sobre todo el documento, C14N inclusiva, RSA-SHA256, digest SHA-256 y X509Certificate', () => {
    expect(consulta.valor(`${FIRMA}/ds:SignedInfo/ds:CanonicalizationMethod/@Algorithm`)).toBe(CANONICALIZACION_C14N_INCLUSIVA);
    expect(consulta.valor(`${FIRMA}/ds:SignedInfo/ds:SignatureMethod/@Algorithm`)).toBe(ALGORITMO_FIRMA);
    expect(consulta.valor(`${FIRMA}/ds:SignedInfo/ds:Reference/@URI`)).toBe('');
    expect(consulta.valores(`${FIRMA}/ds:SignedInfo/ds:Reference/ds:Transforms/ds:Transform/@Algorithm`)).toEqual([
      TRANSFORMACION_ENVELOPED,
      CANONICALIZACION_C14N_INCLUSIVA,
    ]);
    expect(consulta.valor(`${FIRMA}/ds:SignedInfo/ds:Reference/ds:DigestMethod/@Algorithm`)).toBe(ALGORITMO_DIGEST);
    expect(consulta.valor(`${FIRMA}/ds:KeyInfo/ds:X509Data/ds:X509Certificate`)?.replace(/\s/g, '')).toBe(cuerpoPem(llave.certificadoPem));
  });

  it('el hash devuelto es el DigestValue', () => {
    expect(hash).toBe(consulta.valor(`${FIRMA}/ds:SignedInfo/ds:Reference/ds:DigestValue`));
    expect(hash).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });
});

describe('generarXmlFirmado', () => {
  const firmado = generarXmlFirmado(documento, { pfx, clave: CLAVE_PFX });
  const xml = new TextDecoder().decode(firmado.xml);

  it('XML en UTF-8 firmado y verificable, nombre RUC-TIPO-SERIE-NUMERO y el hash de la firma', () => {
    expect(firmado.nombreArchivo).toBe('20601234561-01-F001-00000100');
    expect(verifica(xml, llave.certificadoPem)).toBe(true);
    expect(firmado.hash).toBe(consultasUbl(xml).valor('//ds:DigestValue'));
  });

  it('TR-RNF-113: ni la clave del .pfx ni la llave privada salen en lo que devuelve', () => {
    const devuelto = `${xml}${firmado.hash}${firmado.nombreArchivo}`;
    expect(devuelto).not.toContain(CLAVE_PFX);
    expect(devuelto.replace(/\s/g, '')).not.toContain(cuerpoPem(llave.llavePrivadaPem).slice(0, 64));
  });
});
