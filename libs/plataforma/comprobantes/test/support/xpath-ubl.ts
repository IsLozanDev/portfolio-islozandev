import { DOMParser } from '@xmldom/xmldom';
import * as xpath from 'xpath';

const NAMESPACES = {
  inv: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
};

const seleccionar = xpath.useNamespaces(NAMESPACES);

/** Consultas XPath con los prefijos de UBL (`inv:` para la raíz Invoice). */
export function consultasUbl(xml: string) {
  const documento = new DOMParser().parseFromString(xml, 'text/xml') as unknown as Node;
  const nodos = (expresion: string) => seleccionar(expresion, documento) as Node[];
  return {
    nodos,
    /** Texto o valor del primero; null si no hay. */
    valor: (expresion: string): string | null => {
      const [primero] = nodos(expresion);
      return primero?.textContent ?? null;
    },
    valores: (expresion: string): string[] => nodos(expresion).map((nodo) => nodo.textContent ?? ''),
    cuenta: (expresion: string): number => nodos(expresion).length,
  };
}
