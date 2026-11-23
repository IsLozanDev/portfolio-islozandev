import { aErrorPersonas } from '../models/error-personas';
import { CODIGOS_PERSONA_CAMBIADA, type CambioFicha, type ResultadoPanelFicha } from '../models/ficha';
import { MENSAJES_FICHA } from '../models/mensajes-ficha';
import { mensajeDeError } from '../models/mensajes-personas';
import type { PersonaDetalle } from '../models/persona';

/** El error dice que otro cambió la persona: hay que releerla en vez de mostrar el error. */
export function esPersonaCambiada(error: unknown): boolean {
  return CODIGOS_PERSONA_CAMBIADA.includes(aErrorPersonas(error).codigo);
}

/** Mensaje para el usuario de un error de la API de personas. */
export function mensajeDe(error: unknown): string {
  return mensajeDeError(aErrorPersonas(error));
}

/** Lo que la sección le avisa a la página según cómo se cerró un panel; null si se canceló. */
export function cambioDePanel(resultado: ResultadoPanelFicha | undefined): CambioFicha | null {
  if (!resultado) return null;
  if (resultado.tipo === 'guardada') return { tipo: 'actualizada', persona: resultado.persona };
  if (resultado.tipo === 'obsoleta') return { tipo: 'recargar', aviso: MENSAJES_FICHA.personaCambiada };
  return { tipo: 'recargar', aviso: resultado.aviso };
}

export type ResultadoOperacion = CambioFicha | { tipo: 'error'; mensaje: string };

/**
 * Corre una operación de la ficha: la persona que devuelve es `actualizada`; null (un borrado, 204) pide
 * `recargar`; si otro la cambió, `recargar` con aviso; cualquier otro error, su mensaje.
 */
export async function resultadoDeOperacion(operacion: () => Promise<PersonaDetalle | null>): Promise<ResultadoOperacion> {
  try {
    const persona = await operacion();
    return persona ? { tipo: 'actualizada', persona } : { tipo: 'recargar', aviso: null };
  } catch (error) {
    if (esPersonaCambiada(error)) return { tipo: 'recargar', aviso: MENSAJES_FICHA.personaCambiada };
    return { tipo: 'error', mensaje: mensajeDe(error) };
  }
}
