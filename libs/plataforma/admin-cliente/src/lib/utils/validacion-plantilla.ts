import type { CampoPlantilla } from '../models/errores-plantilla';
import { ERRORES_CAMPO_PLANTILLA } from '../models/mensajes-plantillas';
import { LARGO_MAXIMO_ASUNTO, type VariableDeclarada } from '../models/plantilla';
import { marcadoresNoDeclarados } from './marcadores-plantilla';

const SALTO_DE_LINEA = /[\r\n]/;

/** Las mismas reglas que valida el back al guardar (spec 43), para mostrarlas en el campo al instante. */
export function errorDelAsunto(asunto: string, variables: readonly VariableDeclarada[]): string | null {
  if (asunto.trim().length === 0) return ERRORES_CAMPO_PLANTILLA.asuntoObligatorio;
  if (asunto.length > LARGO_MAXIMO_ASUNTO) return ERRORES_CAMPO_PLANTILLA.asuntoLargo(LARGO_MAXIMO_ASUNTO);
  if (SALTO_DE_LINEA.test(asunto)) return ERRORES_CAMPO_PLANTILLA.asuntoUnaLinea;
  return errorDeMarcadores(asunto, variables);
}

export function errorDelCuerpo(cuerpo: string, variables: readonly VariableDeclarada[]): string | null {
  if (cuerpo.trim().length === 0) return ERRORES_CAMPO_PLANTILLA.cuerpoObligatorio;
  return errorDeMarcadores(cuerpo, variables);
}

/** TR-CA-185 desde el servidor: cada nombre va al campo donde aparece; si no aparece en ninguno, al cuerpo. */
export function variablesPorCampo(nombres: readonly string[], asunto: string, cuerpo: string): Record<CampoPlantilla, string[]> {
  const enAsunto = new Set(marcadoresNoDeclarados(asunto, []));
  const enCuerpo = new Set(marcadoresNoDeclarados(cuerpo, []));
  return {
    asunto: nombres.filter((nombre) => enAsunto.has(nombre)),
    cuerpo: nombres.filter((nombre) => enCuerpo.has(nombre) || !enAsunto.has(nombre)),
  };
}

function errorDeMarcadores(texto: string, variables: readonly VariableDeclarada[]): string | null {
  const noDeclarados = marcadoresNoDeclarados(texto, variables);
  return noDeclarados.length > 0 ? ERRORES_CAMPO_PLANTILLA.variableNoPermitida(noDeclarados) : null;
}
