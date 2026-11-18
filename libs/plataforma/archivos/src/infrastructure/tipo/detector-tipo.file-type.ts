import { fileTypeFromBuffer } from 'file-type';
import type { DetectorTipo } from '../../application/ports/detector-tipo.js';

const MIME_XML = 'application/xml';
const MIME_TEXTO = 'text/plain';
const BYTE_NUL = 0;
const MARCA_DE_ORDEN = '﻿';
const INICIO_DE_MARCADO = '<';

/**
 * `file-type` reconoce los formatos binarios por sus bytes mágicos (PDF, DOCX, JPEG, PNG, WebP, ZIP,
 * ejecutables) y no los de texto. Lo que no reconoce y es UTF-8 válido sin bytes NUL se trata como
 * XML si empieza con marcado, y si no como texto plano.
 */
export class DetectorTipoFileType implements DetectorTipo {
  async detectar(contenido: Uint8Array): Promise<string | null> {
    const binario = await fileTypeFromBuffer(contenido);
    if (binario) return binario.mime;
    const texto = decodificarTexto(contenido);
    if (texto === null) return null;
    return texto.trimStart().startsWith(INICIO_DE_MARCADO) ? MIME_XML : MIME_TEXTO;
  }
}

/** `null` si está vacío, trae bytes NUL o no es UTF-8 válido. Devuelve el texto sin la marca de orden. */
function decodificarTexto(contenido: Uint8Array): string | null {
  if (contenido.length === 0 || contenido.includes(BYTE_NUL)) return null;
  try {
    const texto = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(contenido);
    return texto.startsWith(MARCA_DE_ORDEN) ? texto.slice(MARCA_DE_ORDEN.length) : texto;
  } catch {
    return null;
  }
}
