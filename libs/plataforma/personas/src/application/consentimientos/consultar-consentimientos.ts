import { FINALIDADES, type Finalidad } from '../../domain/consentimiento.js';
import { ConsentimientosDePersona } from '../../domain/consentimientos-de-persona.js';
import type { DependenciasPersonas } from '../dependencias-personas.js';
import type { ConsentimientoVigente, DecisionRegistrada } from '../ports/consentimiento.port.js';
import { exigirPersona } from './exigencias.js';
import { consentimientoVigenteDe, decisionRegistradaDe, type DecisionPorFinalidad } from './vista-consentimiento.js';

/** Decisiones de una persona del tenant. Una persona de otro tenant no existe. */
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

  /** De la más reciente a la más antigua, revocadas incluidas. */
  historial(personaId: string): Promise<DecisionRegistrada[]> {
    const { unidadDeTrabajo, personas, consentimientos } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const persona = await exigirPersona(personas, personaId);
      return (await consentimientos.decisionesDe(persona.id)).map(decisionRegistradaDe);
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
      const persona = await exigirPersona(personas, personaId);
      return new ConsentimientosDePersona(persona.id, await consentimientos.decisionesDe(persona.id));
    });
  }
}
