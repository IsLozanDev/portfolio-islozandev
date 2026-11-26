/** Deja un texto de un tercero (PSE, SUNAT) dentro del largo de su columna. */
export function recortar(texto: string | null, largoMaximo: number): string | null {
  return texto === null ? null : texto.slice(0, largoMaximo);
}
