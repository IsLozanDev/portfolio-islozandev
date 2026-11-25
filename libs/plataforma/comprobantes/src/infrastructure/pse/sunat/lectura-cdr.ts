import type { Element } from '@xmldom/xmldom';
import { elementosPorNombre, interpretarXml, textoDelPrimero } from './documento-xml.js';
import { CdrIlegibleError } from './zip-sunat.js';

const NODO_ELEMENTO = 1;

export interface CdrLeido {
  /** `cac:DocumentResponse/cac:Response/cbc:ResponseCode`. */
  codigo: string;
  descripcion: string | null;
  /** `cbc:Note` de la raíz: observaciones (códigos 4000 o mayores). */
  notas: string[];
}

/** ZIP del CDR en base64 dentro de `sendBillResponse/applicationResponse`; null si la respuesta no lo trae. */
export function zipDeLaRespuesta(sobre: string): Uint8Array | null {
  const documento = interpretarXml(sobre);
  const base64 = documento ? textoDelPrimero(documento, 'applicationResponse') : null;
  return base64 ? Uint8Array.from(Buffer.from(base64, 'base64')) : null;
}

function notasDeLaRaiz(raiz: Element): string[] {
  return Array.from(raiz.childNodes)
    .filter((nodo): nodo is Element => nodo.nodeType === NODO_ELEMENTO && (nodo as Element).localName === 'Note')
    .map((nota) => nota.textContent?.trim() ?? '')
    .filter((nota) => nota !== '');
}

/** CdrIlegibleError si no es un ApplicationResponse con su `ResponseCode`. */
export function leerCdr(xml: string): CdrLeido {
  const documento = interpretarXml(xml);
  const [respuesta] = documento ? elementosPorNombre(documento, 'DocumentResponse').flatMap((nodo) => elementosPorNombre(nodo, 'Response')) : [];
  const codigo = respuesta ? textoDelPrimero(respuesta, 'ResponseCode') : null;
  if (!documento?.documentElement || !respuesta || !codigo) throw new CdrIlegibleError();
  return {
    codigo,
    descripcion: textoDelPrimero(respuesta, 'Description'),
    notas: notasDeLaRaiz(documento.documentElement),
  };
}
