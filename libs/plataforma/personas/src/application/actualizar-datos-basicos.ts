import type { CambiosDatosBasicos } from '../domain/persona.js';
import { modificarPersona, type DependenciasModificarPersona } from './modificar-persona.js';
import type { PersonaDetalle } from './ports/persona.port.js';

export interface ActualizarDatosBasicosComando extends CambiosDatosBasicos {
  personaId: string;
  version: number;
}

/** TR-RF-041: cambia nombres y apellidos de una natural o la razón social de una jurídica. */
export class ActualizarDatosBasicos {
  constructor(private readonly dependencias: DependenciasModificarPersona) {}

  ejecutar({ personaId, version, ...cambios }: ActualizarDatosBasicosComando): Promise<PersonaDetalle> {
    return modificarPersona(this.dependencias, personaId, version, (persona) => persona.cambiarDatosBasicos(cambios));
  }
}
