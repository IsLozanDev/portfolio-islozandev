import type { MotivoDuplicado, ParPersonas } from '../../domain/duplicados.js';
import type { PersonaListada } from './consulta-personas.js';

/** Una persona del par, con los datos de la lista de personas. */
export type PersonaDelPar = Omit<PersonaListada, 'coincidencia'>;

/** `personaA.id < personaB.id`, como `ParPersonas`. */
export interface ParCandidato {
  personaA: PersonaDelPar;
  personaB: PersonaDelPar;
  puntaje: number;
  motivos: MotivoDuplicado[];
}

export interface PaginaDuplicados {
  items: ParCandidato[];
  /** Pares que cumplen el umbral, sin paginar. */
  total: number;
}

export interface CriteriosDuplicados {
  pagina: number;
  tamano: number;
  puntajeMinimo: number;
}

export interface EvaluacionPar {
  puntaje: number;
  motivos: MotivoDuplicado[];
}

/**
 * TR-RF-042, paso 1: pares candidatos del tenant del contexto. La lista solo trae personas activas sin
 * fusionar, del mismo tipo de persona, sin bloqueo de documentos y sin descarte.
 */
export interface ConsultaDuplicados {
  buscar(criterios: CriteriosDuplicados): Promise<PaginaDuplicados>;
  /** Puntaje y motivos del par aunque esté bajo el umbral, bloqueado o descartado; nulo si no cumple ninguna regla. */
  evaluar(par: ParPersonas): Promise<EvaluacionPar | null>;
}
