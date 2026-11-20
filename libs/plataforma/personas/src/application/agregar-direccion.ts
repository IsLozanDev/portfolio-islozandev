import { Direccion } from '../domain/direccion.js';
import type { DependenciasPersonas } from './dependencias-personas.js';
import { modificarPersona, SIN_VERSION_LEIDA, type DependenciasModificarPersona } from './modificar-persona.js';
import type { AgregarDireccionComando, PersonaDetalle } from './ports/persona.port.js';
import { resolverUbicacion } from './ubicacion-ubigeo.js';

/** TR-RF-041: agrega una dirección con su ubigeo vigente; si llega principal, desmarca la anterior. */
export class AgregarDireccion {
  constructor(private readonly dependencias: DependenciasModificarPersona & Pick<DependenciasPersonas, 'ids' | 'catalogo'>) {}

  ejecutar({ personaId, direccion, referencia, ubigeo, principal = false }: AgregarDireccionComando): Promise<PersonaDetalle> {
    const { ids, catalogo } = this.dependencias;

    return modificarPersona(this.dependencias, personaId, SIN_VERSION_LEIDA, async (persona) => {
      const ubicacion = await resolverUbicacion(catalogo, ubigeo);
      return persona.agregarDireccion(Direccion.crear({ id: ids.next(), direccion, referencia, ubigeo, ubicacion, principal }));
    });
  }
}
