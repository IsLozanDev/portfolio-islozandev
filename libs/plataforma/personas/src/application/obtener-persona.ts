import { detalleConAlias, obtenerResuelta } from './alias-personas.js';
import type { DependenciasPersonas } from './dependencias-personas.js';
import type { PersonaDetalle } from './ports/persona.port.js';

/** Persona del tenant con sus roles y contactos; la de una absorbida es su conservada. Una persona de otro tenant no existe. */
export class ObtenerPersona {
  constructor(private readonly dependencias: Pick<DependenciasPersonas, 'unidadDeTrabajo' | 'personas'>) {}

  ejecutar(personaId: string): Promise<PersonaDetalle> {
    const { unidadDeTrabajo, personas } = this.dependencias;

    return unidadDeTrabajo.run(async () => detalleConAlias(personas, await obtenerResuelta(personas, personaId)));
  }
}
