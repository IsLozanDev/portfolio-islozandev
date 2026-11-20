import type { CambiosContacto } from '../domain/persona.js';
import { modificarPersona, type DependenciasModificarPersona } from './modificar-persona.js';
import type { PersonaDetalle } from './ports/persona.port.js';

export interface EditarContactoComando extends CambiosContacto {
  personaId: string;
  contactoId: string;
  version: number;
}

/** TR-RF-041: cambia el valor o el principal de un contacto. El tipo no se edita. */
export class EditarContacto {
  constructor(private readonly dependencias: DependenciasModificarPersona) {}

  ejecutar({ personaId, contactoId, version, ...cambios }: EditarContactoComando): Promise<PersonaDetalle> {
    return modificarPersona(this.dependencias, personaId, version, (persona) => persona.editarContacto(contactoId, cambios));
  }
}
