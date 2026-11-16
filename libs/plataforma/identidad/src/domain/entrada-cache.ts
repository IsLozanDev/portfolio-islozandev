import { recortarCamposMinimos } from './campos-minimos.js';
import type { DocumentoConDatos } from './datos-identidad.js';

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export type EntradaCache = DocumentoConDatos & {
  numero: string;
  fuente: string;
  consultadoEn: Date;
  expiraEn: Date;
};

export interface NuevaEntradaCache {
  documento: DocumentoConDatos;
  numero: string;
  fuente: string;
  consultadoEn: Date;
  ttlDias: number;
}

export function crearEntradaCache({ documento, numero, fuente, consultadoEn, ttlDias }: NuevaEntradaCache): EntradaCache {
  return {
    ...recortarCamposMinimos(documento),
    numero,
    fuente,
    consultadoEn,
    expiraEn: new Date(consultadoEn.getTime() + ttlDias * MILISEGUNDOS_POR_DIA),
  };
}

export function estaVigente(entrada: EntradaCache, ahora: Date): boolean {
  return entrada.expiraEn.getTime() > ahora.getTime();
}
