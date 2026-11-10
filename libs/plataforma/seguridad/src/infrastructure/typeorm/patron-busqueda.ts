// `\` es el escape por defecto de LIKE en PostgreSQL: lo que escribe el usuario se busca literal.
const COMODINES_DE_LIKE = /[\\%_]/g;

/** Patrón de ILIKE que contiene el texto tal cual lo escribió el usuario. */
export function patronDeBusqueda(texto: string): string {
  return `%${texto.replace(COMODINES_DE_LIKE, (comodin) => `\\${comodin}`)}%`;
}
