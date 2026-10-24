/** Esquema JSON opcional de una definición (subconjunto acotado; el adaptador está en infrastructure/ajv). */
export interface ValidadorEsquema {
  /** Problemas del esquema (palabras clave no soportadas o esquema mal formado). Vacío = soportado. */
  soporta(esquema: object): string[];
  /** null si el valor cumple; si no, el mensaje en español para el usuario. */
  validar(esquema: object, valor: unknown): string | null;
}
