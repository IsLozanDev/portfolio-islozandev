import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { NAMESPACES_INVOICE, ID_FIRMA } from '../ubl/atributos-ubl.js';
import type { LlaveDeFirma } from './llave-desde-pfx.js';

export const ALGORITMO_FIRMA_RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
export const ALGORITMO_DIGEST_SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
/** Alternativa si la beta del 51c rechaza SHA-256. */
export const ALGORITMO_FIRMA_RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
export const ALGORITMO_DIGEST_SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1';

export const ALGORITMO_FIRMA = ALGORITMO_FIRMA_RSA_SHA256;
export const ALGORITMO_DIGEST = ALGORITMO_DIGEST_SHA256;
export const CANONICALIZACION_C14N_INCLUSIVA = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
export const TRANSFORMACION_ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

const PREFIJO_FIRMA = 'ds';
const DOCUMENTO_COMPLETO = '/*';
const PRIMER_CONTENIDO_DE_EXTENSION = "(//*[local-name(.)='ExtensionContent'])[1]";

export interface XmlFirmado {
  xmlFirmado: string;
  /** `DigestValue` de la referencia: el hash que va en la representación impresa y en el QR (spec 53). */
  hash: string;
}

function digestDe(xmlFirmado: string): string {
  const documento = new DOMParser().parseFromString(xmlFirmado, 'text/xml');
  const [digest] = Array.from(documento.getElementsByTagNameNS(NAMESPACES_INVOICE.ds, 'DigestValue'));
  if (!digest?.textContent) throw new Error('La firma no trae DigestValue');
  return digest.textContent;
}

/**
 * Firma XMLDSig envuelta en el primer `ext:ExtensionContent`: referencia al documento completo (`URI=""`),
 * transformación enveloped, C14N inclusiva y `KeyInfo` con el `X509Certificate`.
 */
export function firmarXml(xml: string, { llavePrivadaPem, certificadoPem }: LlaveDeFirma): XmlFirmado {
  const firma = new SignedXml({
    privateKey: llavePrivadaPem,
    publicCert: certificadoPem,
    signatureAlgorithm: ALGORITMO_FIRMA,
    canonicalizationAlgorithm: CANONICALIZACION_C14N_INCLUSIVA,
  });
  firma.addReference({
    xpath: DOCUMENTO_COMPLETO,
    isEmptyUri: true,
    transforms: [TRANSFORMACION_ENVELOPED, CANONICALIZACION_C14N_INCLUSIVA],
    digestAlgorithm: ALGORITMO_DIGEST,
  });
  firma.computeSignature(xml, {
    prefix: PREFIJO_FIRMA,
    attrs: { Id: ID_FIRMA },
    location: { reference: PRIMER_CONTENIDO_DE_EXTENSION, action: 'append' },
  });
  const xmlFirmado = firma.getSignedXml();
  return { xmlFirmado, hash: digestDe(xmlFirmado) };
}
