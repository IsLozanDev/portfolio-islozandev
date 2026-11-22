import { exigirCanal, exigirFinalidad } from '../../domain/consentimiento.js';
import { ConsentimientosDePersona } from '../../domain/consentimientos-de-persona.js';
import { eventoConsentimientoRevocado } from '../../domain/eventos-per.js';
import type { DependenciasPersonas } from '../dependencias-personas.js';
import type { DecisionRegistrada } from '../ports/consentimiento.port.js';
import { exigirPersona, exigirUsuario } from './exigencias.js';
import { decisionRegistradaDe } from './vista-consentimiento.js';

export interface RevocarConsentimientoComando {
  personaId: string;
  finalidad: string;
  canal: string;
}

/**
 * TR-RF-043: revoca el ACEPTA vigente de una finalidad y publica `consentimiento.revocado`. La auditoría la
 * deja el consumidor de AUD a partir del evento.
 */
export class RevocarConsentimiento {
  constructor(private readonly dependencias: DependenciasPersonas) {}

  ejecutar(comando: RevocarConsentimientoComando): Promise<DecisionRegistrada> {
    const { unidadDeTrabajo, reloj, contexto, personas, consentimientos, publicador } = this.dependencias;
    const finalidad = exigirFinalidad(comando.finalidad);
    const canal = exigirCanal(comando.canal);

    return unidadDeTrabajo.run(async () => {
      const persona = await exigirPersona(personas, comando.personaId);
      const historial = new ConsentimientosDePersona(persona.id, await consentimientos.decisionesDe(persona.id));
      const revocado = historial.revocar(finalidad, exigirUsuario(contexto), canal, reloj.now());

      await consentimientos.guardar([], [revocado]);
      await publicador.publish(eventoConsentimientoRevocado(revocado, persona.version));
      return decisionRegistradaDe(revocado);
    });
  }
}
