import { AsuntoDemasiadoLargoError, VariableNoPermitidaError, VariablesIncompletasError } from './errores.js';
import type { Plantilla } from './plantilla.js';

export type ValoresVariables = Readonly<Record<string, string | number>>;

export interface ContenidoRenderizado {
  asunto: string;
  cuerpo: string;
}

/** Largo de `ntf.mensaje.asunto`. */
export const LARGO_MAXIMO_ASUNTO = 150;

/** `{{nombre}}` con espacios opcionales dentro de las llaves. */
const MARCADOR = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const SALTOS_DE_LINEA = /[\r\n]+/g;
const ESPACIO = ' ';

const ESCAPES_HTML: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const CARACTERES_HTML = /[&<>"']/g;

/**
 * Inserta las variables en el asunto y el cuerpo de la plantilla. Solo se aceptan las variables declaradas
 * (TR-CA-185) y deben llegar todas las que la plantilla usa. En el cuerpo (HTML) los valores se escapan; en el
 * asunto van como texto plano en una sola línea.
 */
export function renderizar(plantilla: Plantilla, variables: ValoresVariables): ContenidoRenderizado {
  exigirSoloDeclaradas(plantilla, variables);
  const asuntoBase = plantilla.asunto ?? '';
  exigirLasUsadas([asuntoBase, plantilla.cuerpo], variables);
  const asunto = reemplazar(asuntoBase, variables, comoTextoDeUnaLinea);
  if (asunto.length > LARGO_MAXIMO_ASUNTO) throw new AsuntoDemasiadoLargoError(LARGO_MAXIMO_ASUNTO);
  return { asunto, cuerpo: reemplazar(plantilla.cuerpo, variables, escaparHtml) };
}

function exigirSoloDeclaradas(plantilla: Plantilla, variables: ValoresVariables): void {
  const declaradas = new Set(plantilla.variables.map((variable) => variable.nombre));
  const noDeclaradas = Object.keys(variables).filter((nombre) => !declaradas.has(nombre));
  if (noDeclaradas.length > 0) throw new VariableNoPermitidaError(noDeclaradas);
}

function exigirLasUsadas(textos: readonly string[], variables: ValoresVariables): void {
  const usadas = new Set(textos.flatMap((texto) => [...texto.matchAll(MARCADOR)].map((coincidencia) => coincidencia[1])));
  const faltantes = [...usadas].filter((nombre) => !(nombre in variables));
  if (faltantes.length > 0) throw new VariablesIncompletasError(faltantes);
}

function reemplazar(texto: string, variables: ValoresVariables, formatear: (valor: string) => string): string {
  return texto.replace(MARCADOR, (_marcador, nombre: string) => formatear(String(variables[nombre])));
}

function escaparHtml(valor: string): string {
  return valor.replace(CARACTERES_HTML, (caracter) => ESCAPES_HTML[caracter]);
}

function comoTextoDeUnaLinea(valor: string): string {
  return valor.replace(SALTOS_DE_LINEA, ESPACIO);
}
