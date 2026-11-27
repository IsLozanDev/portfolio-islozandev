import type { VariableDeclarada } from '../models/plantilla';

/** Misma expresión que el back (spec 43): `{{nombre}}` con espacios opcionales dentro de las llaves. */
const MARCADOR = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export interface TextoConCursor {
  texto: string;
  /** Posición justo después de lo insertado. */
  cursor: number;
}

/** TR-CA-185 en el campo: nombres usados que la base no declara, sin repetir y en orden de aparición. */
export function marcadoresNoDeclarados(texto: string, variables: readonly VariableDeclarada[]): string[] {
  const declarados = new Set(variables.map((variable) => variable.nombre));
  const usados = [...texto.matchAll(MARCADOR)].map((coincidencia) => coincidencia[1]);
  return [...new Set(usados)].filter((nombre) => !declarados.has(nombre));
}

/** Reemplaza la selección `[inicio, fin)` por la inserción; sin selección, inserta en el cursor. */
export function insertarEnCursor(texto: string, inicio: number, fin: number, insercion: string): TextoConCursor {
  const desde = Math.max(0, Math.min(inicio, texto.length));
  const hasta = Math.max(desde, Math.min(fin, texto.length));
  return { texto: texto.slice(0, desde) + insercion + texto.slice(hasta), cursor: desde + insercion.length };
}

export function marcadorDe(nombre: string): string {
  return `{{${nombre}}}`;
}
