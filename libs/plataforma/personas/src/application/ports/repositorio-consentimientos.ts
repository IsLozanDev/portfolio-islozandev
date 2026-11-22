import type { Consentimiento, Finalidad } from '../../domain/consentimiento.js';
import type { TextoFinalidad } from '../../domain/texto-finalidad.js';

/** Textos y decisiones del tenant del contexto. Lo de otro tenant no existe para quien consulta. */
export interface RepositorioConsentimientos {
  /** Historial, de la más reciente a la más antigua. */
  decisionesDe(personaId: string): Promise<Consentimiento[]>;
  /**
   * Marca primero las revocadas y después inserta las nuevas. Lanza `ConflictError` si otra operación revocó o
   * aceptó la misma finalidad entretanto.
   */
  guardar(nuevas: Consentimiento[], revocadas: Consentimiento[]): Promise<void>;
  /** Uno por finalidad publicada: el de mayor `publicadoEn`. */
  textosVigentes(): Promise<TextoFinalidad[]>;
  /** Del más reciente al más antiguo. */
  historialTextos(finalidad: Finalidad): Promise<TextoFinalidad[]>;
  /** Lanza `VersionTextoDuplicadaError` si la versión ya existe en la finalidad. */
  publicarTexto(texto: TextoFinalidad): Promise<void>;
}
