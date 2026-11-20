import { modificarPersona, type DependenciasModificarPersona } from './modificar-persona.js';
import type { PersonaDetalle } from './ports/persona.port.js';

export interface EliminarDireccionComando {
  personaId: string;
  direccionId: string;
  version: number;
}

/** TR-RF-041: borra una dirección, también la principal. */
export class EliminarDireccion {
  constructor(private readonly dependencias: DependenciasModificarPersona) {}

  ejecutar({ personaId, direccionId, version }: EliminarDireccionComando): Promise<PersonaDetalle> {
    return modificarPersona(this.dependencias, personaId, version, (persona) => persona.eliminarDireccion(direccionId));
  }
}
