import { VariableNoPermitidaError } from './errores.js';
import type { VariableDeclarada } from './plantilla.js';

/** `{{nombre}}` con espacios opcionales dentro de las llaves. Global: se usa con `matchAll` y `replace`. */
export const MARCADOR = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Nombres de las variables que el texto usa, sin repetir y en orden de aparición. */
export function marcadoresUsados(texto: string): string[] {
  return [...new Set([...texto.matchAll(MARCADOR)].map((coincidencia) => coincidencia[1]))];
}

/** TR-CA-185 al guardar: todo marcador de los textos debe ser una variable declarada por la base. */
export function exigirMarcadoresDeclarados(textos: readonly string[], declaradas: readonly VariableDeclarada[]): void {
  const nombresDeclarados = new Set(declaradas.map((variable) => variable.nombre));
  const usados = [...new Set(textos.flatMap(marcadoresUsados))];
  const noDeclarados = usados.filter((nombre) => !nombresDeclarados.has(nombre));
  if (noDeclarados.length > 0) throw new VariableNoPermitidaError(noDeclarados);
}
