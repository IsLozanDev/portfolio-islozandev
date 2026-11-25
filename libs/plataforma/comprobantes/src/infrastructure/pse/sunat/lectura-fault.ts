import { elementosPorNombre, interpretarXml, textoDelPrimero } from './documento-xml.js';

export interface FaultLeido {
  /** Código SUNAT; null si el fault no trae uno numérico. */
  codigo: string | null;
  descripcion: string | null;
}

/** `soap-env:Client.2335` o `ns0:0102` → el número del final. */
const CODIGO_AL_FINAL = /(\d+)$/;
/** `0109`, o `2335 - El documento…`, en el faultstring → el número del inicio. */
const CODIGO_AL_INICIO = /^(\d+)/;

function codigoDe(faultcode: string | null, faultstring: string | null): string | null {
  return faultcode?.match(CODIGO_AL_FINAL)?.[1] ?? faultstring?.match(CODIGO_AL_INICIO)?.[1] ?? null;
}

/** null si la respuesta no es un `soap:Fault`. */
export function leerFault(sobre: string): FaultLeido | null {
  const documento = interpretarXml(sobre);
  const [fault] = documento ? elementosPorNombre(documento, 'Fault') : [];
  if (!fault) return null;
  const faultcode = textoDelPrimero(fault, 'faultcode');
  const faultstring = textoDelPrimero(fault, 'faultstring');
  return { codigo: codigoDe(faultcode, faultstring), descripcion: faultstring };
}
