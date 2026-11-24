import { ParPersonas } from '../../domain/duplicados.js';
import { PersonaNoEncontradaError } from '../../domain/errores.js';
import type { RepositorioPersonas } from '../ports/repositorio-personas.js';

export const ENTIDAD_AUDITADA = 'persona';

/** El par ordenado, si las dos personas son del tenant. Una persona de otro tenant no existe. */
export async function exigirParDelTenant(personas: RepositorioPersonas, unaPersonaId: string, otraPersonaId: string): Promise<ParPersonas> {
  const par = ParPersonas.de(unaPersonaId, otraPersonaId);
  for (const personaId of [par.menor, par.mayor]) {
    if (!(await personas.obtener(personaId))) throw new PersonaNoEncontradaError();
  }
  return par;
}

export function paraAuditoria(par: ParPersonas): { persona_menor_id: string; persona_mayor_id: string } {
  return { persona_menor_id: par.menor, persona_mayor_id: par.mayor };
}
