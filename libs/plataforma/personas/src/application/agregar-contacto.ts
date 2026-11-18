import { Contacto } from '../domain/contacto.js';
import type { DependenciasPersonas } from './dependencias-personas.js';
import { modificarPersona, SIN_VERSION_LEIDA, type DependenciasModificarPersona } from './modificar-persona.js';
import type { AgregarContactoComando, PersonaDetalle } from './ports/persona.port.js';

/** TR-RF-041: agrega un contacto; si llega principal, desmarca el anterior de su tipo. */
export class AgregarContacto {
  constructor(private readonly dependencias: DependenciasModificarPersona & Pick<DependenciasPersonas, 'ids'>) {}

  async ejecutar({ personaId, tipo, valor, principal = false }: AgregarContactoComando): Promise<PersonaDetalle> {
    const contacto = Contacto.crear({ id: this.dependencias.ids.next(), tipo, valor, principal });
    return modificarPersona(this.dependencias, personaId, SIN_VERSION_LEIDA, (persona) => persona.agregarContacto(contacto));
  }
}
