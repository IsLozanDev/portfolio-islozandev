import { formatearNumero } from '../../domain/comprobante/tipo-comprobante.js';
import type { DocumentoElectronico } from '../../domain/documento-electronico.js';
import { firmarXml } from './firma/firmador-xml.js';
import { llaveDesdePfx } from './firma/llave-desde-pfx.js';
import { generarInvoiceUbl } from './ubl/invoice-ubl.js';

export interface CertificadoDeFirma {
  pfx: Uint8Array;
  clave: string;
}

export interface DocumentoFirmado {
  /** UTF-8. */
  xml: Uint8Array;
  hash: string;
  /** `RUC-TIPO-SERIE-NUMERO`, sin extensión: el nombre del XML y del ZIP que envía el 51c. */
  nombreArchivo: string;
}

const codificador = new TextEncoder();

export function nombreArchivoSunat({ emisor, tipo, serie, numero }: DocumentoElectronico): string {
  return `${emisor.ruc}-${tipo}-${formatearNumero(serie, numero)}`;
}

/** UBL 2.1 firmado con el .pfx del emisor: lo que el adaptador SUNAT directo comprime y envía. */
export function generarXmlFirmado(documento: DocumentoElectronico, certificado: CertificadoDeFirma): DocumentoFirmado {
  const { xmlFirmado, hash } = firmarXml(generarInvoiceUbl(documento), llaveDesdePfx(certificado.pfx, certificado.clave));
  return { xml: codificador.encode(xmlFirmado), hash, nombreArchivo: nombreArchivoSunat(documento) };
}
