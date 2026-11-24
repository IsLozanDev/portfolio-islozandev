import type { ValoresVariables } from './renderizador-plantilla.js';
import type { VariableDeclarada } from './plantilla.js';

/** Valores de la vista previa: el `ejemplo` declarado o, si falta, `[nombre]`. */
export function valoresDeEjemplo(variables: readonly VariableDeclarada[]): ValoresVariables {
  return Object.fromEntries(variables.map((variable) => [variable.nombre, variable.ejemplo ?? `[${variable.nombre}]`]));
}
