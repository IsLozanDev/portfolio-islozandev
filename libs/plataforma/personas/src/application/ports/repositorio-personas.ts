import type { TipoDocumentoPersona } from '../../domain/documento-identidad.js';
import type { Persona } from '../../domain/persona.js';

/** Personas del tenant del contexto. Una persona de otro tenant no existe para quien consulta. */
export interface RepositorioPersonas {
  buscarPorDocumento(tipo: TipoDocumentoPersona, numero: string): Promise<Persona | null>;
  obtener(personaId: string): Promise<Persona | null>;
  /**
   * Guarda la persona con sus roles y contactos nuevos. Lanza `PersonaDuplicadaError` si el documento ya
   * existe en el tenant y `ConflictError` si otra operación cambió la persona desde que se leyó.
   */
  guardar(persona: Persona): Promise<void>;
}
