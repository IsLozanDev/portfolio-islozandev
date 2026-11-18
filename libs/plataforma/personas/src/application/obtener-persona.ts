import { PersonaNoEncontradaError } from '../domain/errores.js';
import type { DependenciasPersonas } from './dependencias-personas.js';
import type { PersonaDetalle } from './ports/persona.port.js';
import { detalleDe } from './vista-persona.js';

/** Persona del tenant con sus roles y contactos. Una persona de otro tenant no existe. */
export class ObtenerPersona {
  constructor(private readonly dependencias: Pick<DependenciasPersonas, 'unidadDeTrabajo' | 'personas'>) {}

  ejecutar(personaId: string): Promise<PersonaDetalle> {
    const { unidadDeTrabajo, personas } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const persona = await personas.obtener(personaId);
      if (!persona) throw new PersonaNoEncontradaError();
      return detalleDe(persona);
    });
  }
}
