import type { TenantContext } from '@vitrina/plataforma/kernel';
import { DatosConsentimientoInvalidosError, PersonaNoEncontradaError } from '../../domain/errores.js';
import type { Persona } from '../../domain/persona.js';
import { exigirSinFusionar } from '../alias-personas.js';
import type { RepositorioPersonas } from '../ports/repositorio-personas.js';

/** Para registrar o revocar. Una persona de otro tenant no existe; una absorbida no consiente (spec 39). */
export async function exigirPersona(personas: RepositorioPersonas, personaId: string): Promise<Persona> {
  const persona = await personas.obtener(personaId);
  if (!persona) throw new PersonaNoEncontradaError();
  exigirSinFusionar(persona);
  return persona;
}

/** Quien registra, revoca o publica: sin usuario en el contexto no queda rastro de quién decidió. */
export function exigirUsuario(contexto: TenantContext): string {
  const { actorId } = contexto.current();
  if (!actorId) throw new DatosConsentimientoInvalidosError('La operación necesita el usuario que la hace');
  return actorId;
}
