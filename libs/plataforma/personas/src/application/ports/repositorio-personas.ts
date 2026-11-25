import type { TipoDocumentoPersona } from '../../domain/documento-identidad.js';
import type { ResultadoAbsorcion } from '../../domain/fusion.js';
import type { Persona } from '../../domain/persona.js';

/** Personas del tenant del contexto. Una persona de otro tenant no existe para quien consulta. */
export interface RepositorioPersonas {
  buscarPorDocumento(tipo: TipoDocumentoPersona, numero: string): Promise<Persona | null>;
  obtener(personaId: string): Promise<Persona | null>;
  /**
   * Guarda la persona con su denominación y sus roles nuevos, y deja sus contactos y direcciones como
   * están en el agregado (altas, cambios y bajas). Lanza `PersonaDuplicadaError` si el documento ya existe
   * en el tenant, `ContactoDuplicadoError` si otra operación agregó el mismo contacto y `ConflictError`
   * si otra operación cambió la persona desde que se leyó.
   */
  guardar(persona: Persona): Promise<void>;
  /**
   * Escribe una fusión ya aplicada en los dos agregados: las dos filas con bloqueo optimista, el alias de la
   * absorbida y el paso de roles, contactos y direcciones a la conservada (cambio de `persona_id`, sin borrar).
   */
  guardarFusion(conservada: Persona, absorbida: Persona, movimientos: ResultadoAbsorcion): Promise<void>;
  /** Ids de las absorbidas que apuntan a la persona. */
  aliasDe(personaId: string): Promise<string[]>;
}
