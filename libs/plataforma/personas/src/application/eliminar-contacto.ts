import { modificarPersona, type DependenciasModificarPersona } from './modificar-persona.js';
import type { PersonaDetalle } from './ports/persona.port.js';

export interface EliminarContactoComando {
  personaId: string;
  contactoId: string;
  version: number;
}

/** TR-RF-041: borra un contacto. El celular principal no se borra. */
export class EliminarContacto {
  constructor(private readonly dependencias: DependenciasModificarPersona) {}

  ejecutar({ personaId, contactoId, version }: EliminarContactoComando): Promise<PersonaDetalle> {
    return modificarPersona(this.dependencias, personaId, version, (persona) => persona.eliminarContacto(contactoId));
  }
}
