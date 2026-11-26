import { recortar } from '../recortar.js';
import type { RespuestaPse } from '../respuesta-pse.js';
import { esEstadoFinal, type EstadoFinal } from './tipo-comprobante.js';

/** Los largos de las columnas de 01x en fe.comprobante. */
const LARGO_MAXIMO_CODIGO_RESPUESTA = 10;
const LARGO_MAXIMO_DESCRIPCION_RESPUESTA = 500;
const LARGO_MAXIMO_HASH = 100;

/** La respuesta de SUNAT que deja el comprobante en un estado final. */
export interface RespuestaFinal {
  resultado: EstadoFinal;
  codigo: string | null;
  descripcion: string | null;
  observaciones: string[];
  hash: string | null;
}

/** Ids de TR-ARC; nulos si la subida falló (estado primero, archivo después) o si SUNAT no devolvió CDR. */
export interface ArchivosRespuesta {
  xmlArchivoId: string | null;
  cdrArchivoId: string | null;
}

export interface RespuestaComprobante extends RespuestaFinal, ArchivosRespuesta {
  respondidoEn: Date;
}

/** `null` si la respuesta no cierra el envío (error técnico, credencial inválida, en proceso). */
export function respuestaFinalDe(respuesta: RespuestaPse): RespuestaFinal | null {
  const { resultado } = respuesta;
  if (!esEstadoFinal(resultado)) return null;
  return {
    resultado,
    codigo: recortar(respuesta.codigo, LARGO_MAXIMO_CODIGO_RESPUESTA),
    descripcion: recortar(respuesta.descripcion, LARGO_MAXIMO_DESCRIPCION_RESPUESTA),
    observaciones: [...respuesta.observaciones],
    hash: recortar(respuesta.hash ?? null, LARGO_MAXIMO_HASH),
  };
}
