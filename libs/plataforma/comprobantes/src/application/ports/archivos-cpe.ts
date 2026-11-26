import type { DocumentoElectronico } from '../../domain/documento-electronico.js';

/**
 * El XML firmado y el CDR de un comprobante en TR-ARC (categoría CPE_XML). Devuelve el id del archivo o null si
 * la subida siguió fallando tras sus reintentos: el estado del comprobante se registra igual (spec 52).
 */
export interface ArchivosCpe {
  guardarXml(comprobanteId: string, documento: DocumentoElectronico, xml: Uint8Array): Promise<string | null>;
  guardarCdr(comprobanteId: string, documento: DocumentoElectronico, cdr: Uint8Array): Promise<string | null>;
}
