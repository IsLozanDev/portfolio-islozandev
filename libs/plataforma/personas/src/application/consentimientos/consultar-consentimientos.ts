import { FINALIDADES, type Finalidad } from '../../domain/consentimiento.js';
import { ConsentimientosDePersona } from '../../domain/consentimientos-de-persona.js';
import type { DependenciasPersonas } from '../dependencias-personas.js';
import type { ConsentimientoVigente, DecisionRegistrada } from '../ports/consentimiento.port.js';
import { obtenerResuelta } from '../alias-personas.js';
import { consentimientoVigenteDe, decisionRegistradaDe, type DecisionPorFinalidad } from './vista-consentimiento.js';

/**
 * Decisiones de una persona del tenant; las de una absorbida son las de su conservada. Los vigentes son solo
 * los de la conservada: no se infiere consentimiento de un alias (Ley 29733). Una persona de otro tenant no existe.
 */
export class ConsultarConsentimientos {
  constructor(private readonly dependencias: Pick<DependenciasPersonas, 'unidadDeTrabajo' | 'personas' | 'consentimientos'>) {}

  /** Las cinco finalidades, en el orden de la lista, con su decisión vigente o `null`. */
  async vigentes(personaId: string): Promise<DecisionPorFinalidad[]> {
    const historial = await this.historialDe(personaId);
    return FINALIDADES.map((finalidad) => {
      const vigente = historial.decisionVigente(finalidad);
      return { finalidad, decision: vigente ? decisionRegistradaDe(vigente) : null };
    });
  }

  /** De la más reciente a la más antigua, revocadas incluidas, con las de sus alias. */
  historial(personaId: string): Promise<DecisionRegistrada[]> {
    const { unidadDeTrabajo, personas, consentimientos } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const { persona } = await obtenerResuelta(personas, personaId);
      const fichas = [persona.id, ...(await personas.aliasDe(persona.id))];
      const deCadaFicha = await Promise.all(fichas.map((fichaId) => consentimientos.decisionesDe(fichaId)));
      return deCadaFicha
        .flat()
        .sort((una, otra) => otra.registradoEn.getTime() - una.registradoEn.getTime())
        .map(decisionRegistradaDe);
    });
  }

  /** ACEPTA sin revocar, con la versión aceptada aunque ya no sea la vigente del texto. */
  async vigente(personaId: string, finalidad: Finalidad): Promise<ConsentimientoVigente | null> {
    const consentimiento = (await this.historialDe(personaId)).consentimientoVigente(finalidad);
    return consentimiento ? consentimientoVigenteDe(consentimiento) : null;
  }

  private historialDe(personaId: string): Promise<ConsentimientosDePersona> {
    const { unidadDeTrabajo, personas, consentimientos } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const { persona } = await obtenerResuelta(personas, personaId);
      return new ConsentimientosDePersona(persona.id, await consentimientos.decisionesDe(persona.id));
    });
  }
}
