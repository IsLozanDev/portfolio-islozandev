import { DOMParser, type Document, type Element } from '@xmldom/xmldom';

const TIPO_XML = 'text/xml';

/** null si el texto no es XML: el llamador lo trata como respuesta ilegible. */
export function interpretarXml(texto: string): Document | null {
  try {
    const documento = new DOMParser({ onError: () => undefined }).parseFromString(texto, TIPO_XML);
    return documento.documentElement ? documento : null;
  } catch {
    return null;
  }
}

/** Elementos con ese nombre local en cualquier namespace (SUNAT varía los prefijos). */
export function elementosPorNombre(raiz: Document | Element, nombreLocal: string): Element[] {
  return Array.from(raiz.getElementsByTagNameNS('*', nombreLocal));
}

/** Texto recortado del primero con ese nombre local; null si no hay. */
export function textoDelPrimero(raiz: Document | Element, nombreLocal: string): string | null {
  const [primero] = elementosPorNombre(raiz, nombreLocal);
  return primero?.textContent?.trim() ?? null;
}
