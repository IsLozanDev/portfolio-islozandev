import { PersonaNoEncontradaError, PersonaYaFusionadaError } from '../domain/errores.js';
import type { Persona } from '../domain/persona.js';
import type { PersonaDetalle } from './ports/persona.port.js';
import type { RepositorioPersonas } from './ports/repositorio-personas.js';
import { detalleDe } from './vista-persona.js';

export interface PersonaResuelta {
  persona: Persona;
  /** Id de la absorbida pedida; nulo si se pidió la conservada. */
  resueltaDesde: string | null;
}

/**
 * Las lecturas de una absorbida devuelven su conservada (spec 39). Un salto basta: al fusionar, los alias de
 * la absorbida se re-apuntan a la nueva conservada.
 */
export async function resolverAlias(personas: RepositorioPersonas, persona: Persona): Promise<PersonaResuelta> {
  if (!persona.fusion) return { persona, resueltaDesde: null };
  const conservada = await personas.obtener(persona.fusion.conservadaId);
  if (!conservada) throw new PersonaNoEncontradaError();
  return { persona: conservada, resueltaDesde: persona.id };
}

/** Persona del tenant, resuelta si es alias. Una persona de otro tenant no existe. */
export async function obtenerResuelta(personas: RepositorioPersonas, personaId: string): Promise<PersonaResuelta> {
  const persona = await personas.obtener(personaId);
  if (!persona) throw new PersonaNoEncontradaError();
  return resolverAlias(personas, persona);
}

/** Las escrituras no siguen el alias: el cliente debe cargar la conservada. */
export function exigirSinFusionar(persona: Persona): void {
  if (persona.fusion) throw new PersonaYaFusionadaError(persona.fusion.conservadaId);
}

export async function detalleConAlias(personas: RepositorioPersonas, { persona, resueltaDesde }: PersonaResuelta): Promise<PersonaDetalle> {
  return detalleDe(persona, { resueltaDesde, alias: await personas.aliasDe(persona.id) });
}
