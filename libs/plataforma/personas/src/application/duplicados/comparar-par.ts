import { ParPersonas, type MotivoDuplicado } from '../../domain/duplicados.js';
import { PersonaNoEncontradaError } from '../../domain/errores.js';
import { errorDeFusion } from '../../domain/fusion.js';
import type { Persona } from '../../domain/persona.js';
import type { DependenciasPersonas } from '../dependencias-personas.js';
import type { PersonaDetalle } from '../ports/persona.port.js';
import { detalleDe } from '../vista-persona.js';

export interface ComparacionPar {
  /** La de id menor, como en la lista. */
  personaA: PersonaDetalle;
  personaB: PersonaDetalle;
  /** 0 y sin motivos si el par no cumple ninguna regla. */
  puntaje: number;
  motivos: MotivoDuplicado[];
  descartado: boolean;
  /** Código del error que impediría fusionarlas, o nulo. */
  bloqueo: string | null;
}

const SIN_COINCIDENCIAS = { puntaje: 0, motivos: [] };

/**
 * TR-RF-042, paso 2: las dos fichas completas, con su versión, tal como se pidieron (sin resolver alias), y
 * lo que diría la fusión. Informa aunque el par esté descartado o bloqueado.
 */
export class CompararPar {
  constructor(private readonly dependencias: Pick<DependenciasPersonas, 'unidadDeTrabajo' | 'personas' | 'consultaDuplicados' | 'fusiones'>) {}

  async ejecutar(unaPersonaId: string, otraPersonaId: string): Promise<ComparacionPar> {
    const par = ParPersonas.de(unaPersonaId, otraPersonaId);
    const { unidadDeTrabajo, personas, consultaDuplicados, fusiones } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const [personaA, personaB] = [await this.exigir(par.menor), await this.exigir(par.mayor)];
      const evaluacion = (await consultaDuplicados.evaluar(par)) ?? SIN_COINCIDENCIAS;
      return {
        personaA: detalleDe(personaA, { resueltaDesde: null, alias: await personas.aliasDe(personaA.id) }),
        personaB: detalleDe(personaB, { resueltaDesde: null, alias: await personas.aliasDe(personaB.id) }),
        ...evaluacion,
        descartado: await fusiones.estaDescartado(par),
        bloqueo: errorDeFusion(personaA, personaB)?.code ?? null,
      };
    });
  }

  private async exigir(personaId: string): Promise<Persona> {
    const persona = await this.dependencias.personas.obtener(personaId);
    if (!persona) throw new PersonaNoEncontradaError();
    return persona;
  }
}
