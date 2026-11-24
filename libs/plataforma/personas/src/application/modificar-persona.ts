import { PersonaNoEncontradaError, VersionObsoletaPersonaError } from '../domain/errores.js';
import type { Persona } from '../domain/persona.js';
import { publicarEventosDe, type DependenciasPersonas } from './dependencias-personas.js';
import { detalleConAlias, exigirSinFusionar } from './alias-personas.js';
import type { PersonaDetalle } from './ports/persona.port.js';

export type DependenciasModificarPersona = Pick<DependenciasPersonas, 'unidadDeTrabajo' | 'publicador' | 'personas'>;

/** Aplica el cambio sobre la persona y dice si cambió algo. */
export type CambioDePersona = (persona: Persona) => boolean | Promise<boolean>;

/** Agregar no pisa nada que el cliente haya leído: no compara versión. */
export const SIN_VERSION_LEIDA = null;

/**
 * Carga la persona del tenant, compara la versión que leyó el cliente, aplica el cambio y, si hubo cambio,
 * guarda y publica `persona.actualizada` en la misma transacción (regla 4). Sin cambio no escribe ni
 * publica (TR-RNF-008). Una absorbida no se edita: el cliente debe cargar la conservada.
 */
export function modificarPersona(
  dependencias: DependenciasModificarPersona,
  personaId: string,
  versionLeida: number | null,
  cambio: CambioDePersona,
): Promise<PersonaDetalle> {
  const { unidadDeTrabajo, publicador, personas } = dependencias;

  return unidadDeTrabajo.run(async () => {
    const persona = await personas.obtener(personaId);
    if (!persona) throw new PersonaNoEncontradaError();
    exigirSinFusionar(persona);
    if (versionLeida !== SIN_VERSION_LEIDA && versionLeida !== persona.version) throw new VersionObsoletaPersonaError();
    const resuelta = { persona, resueltaDesde: null };
    if (!(await cambio(persona))) return detalleConAlias(personas, resuelta);

    await personas.guardar(persona);
    await publicarEventosDe(publicador, persona);
    return detalleConAlias(personas, resuelta);
  });
}
