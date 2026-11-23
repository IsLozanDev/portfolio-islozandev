const MARCAS_DIACRITICAS = /\p{M}/gu;
const NO_ALFANUMERICO = /[^a-z0-9]+/g;

/** Minúsculas, sin tildes ni diéresis (ñ → n), solo letras y dígitos: lo mismo que hace la API al buscar. */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(MARCAS_DIACRITICAS, '').toLowerCase().replace(NO_ALFANUMERICO, ' ').trim();
}
