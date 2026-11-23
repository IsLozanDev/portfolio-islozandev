import { ConsultaMuyCortaError } from './errores.js';

export const LONGITUD_MINIMA_TEXTO = 3;
export const LONGITUD_MINIMA_NUMERO = 4;

/** Por dónde se busca: documento o teléfono, correo, o nombres y razón social. */
export type ClaseConsulta = 'NUMERO' | 'CORREO' | 'TEXTO';

export interface ConsultaClasificada {
  clase: ClaseConsulta;
  /** NUMERO: solo dígitos. CORREO: en minúsculas. TEXTO: palabras normalizadas como `per.normalizar_busqueda`. */
  valor: string;
  /** Solo en TEXTO: cada palabra debe coincidir. */
  palabras: string[];
}

const SEPARADORES_DE_NUMERO = /[\s-]/g;
const SOLO_DIGITOS = /^\d+$/;
const MARCAS_DIACRITICAS = /\p{M}/gu;
const NO_ALFANUMERICO = /[^a-z0-9]+/g;

/** Minúsculas, sin tildes ni diéresis (ñ → n), solo letras y dígitos: lo mismo que hace la base. */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(MARCAS_DIACRITICAS, '').toLowerCase().replace(NO_ALFANUMERICO, ' ').trim();
}

/**
 * Clasifica lo que escribió el usuario. Vacío → null (sin filtro de texto). Más corto que el mínimo de su
 * clase → ConsultaMuyCortaError. El mensaje no lleva el texto: puede ser un nombre o un documento.
 */
export function clasificarConsulta(entrada: string | undefined): ConsultaClasificada | null {
  const recortada = (entrada ?? '').trim();
  if (recortada === '') return null;

  const digitos = recortada.replace(SEPARADORES_DE_NUMERO, '');
  if (SOLO_DIGITOS.test(digitos)) {
    if (digitos.length < LONGITUD_MINIMA_NUMERO) throw new ConsultaMuyCortaError();
    return { clase: 'NUMERO', valor: digitos, palabras: [] };
  }

  if (recortada.includes('@')) {
    const correo = recortada.toLowerCase();
    if (correo.length < LONGITUD_MINIMA_TEXTO) throw new ConsultaMuyCortaError();
    return { clase: 'CORREO', valor: correo, palabras: [] };
  }

  const normalizado = normalizarTexto(recortada);
  if (normalizado.replace(/\s/g, '').length < LONGITUD_MINIMA_TEXTO) throw new ConsultaMuyCortaError();
  return { clase: 'TEXTO', valor: normalizado, palabras: normalizado.split(' ') };
}
