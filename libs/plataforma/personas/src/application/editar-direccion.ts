import type { Persona } from '../domain/persona.js';
import type { DependenciasPersonas } from './dependencias-personas.js';
import { modificarPersona, type DependenciasModificarPersona } from './modificar-persona.js';
import type { PersonaDetalle } from './ports/persona.port.js';
import { resolverUbicacion } from './ubicacion-ubigeo.js';

export interface EditarDireccionComando {
  personaId: string;
  direccionId: string;
  version: number;
  direccion?: string;
  referencia?: string | null;
  ubigeo?: string;
  principal?: boolean;
}

/**
 * TR-RF-041: cambia el texto, la referencia, el ubigeo o el principal de una dirección. El ubigeo solo se
 * valida contra el catálogo si cambia: una dirección de un distrito que cerró su vigencia sigue editable.
 */
export class EditarDireccion {
  constructor(private readonly dependencias: DependenciasModificarPersona & Pick<DependenciasPersonas, 'catalogo'>) {}

  ejecutar({ personaId, direccionId, version, ...cambios }: EditarDireccionComando): Promise<PersonaDetalle> {
    const { catalogo } = this.dependencias;

    return modificarPersona(this.dependencias, personaId, version, async (persona) => {
      if (!cambiaDeUbigeo(persona, direccionId, cambios.ubigeo)) return persona.editarDireccion(direccionId, cambios);
      const ubicacion = await resolverUbicacion(catalogo, cambios.ubigeo);
      return persona.editarDireccion(direccionId, { ...cambios, ubicacion });
    });
  }
}

/** Una dirección que no es de la persona no consulta el catálogo: la rechaza el agregado. */
function cambiaDeUbigeo(persona: Persona, direccionId: string, ubigeo: string | undefined): ubigeo is string {
  const guardada = persona.direcciones.find((direccion) => direccion.id === direccionId);
  return guardada !== undefined && ubigeo !== undefined && ubigeo !== guardada.ubigeo;
}
