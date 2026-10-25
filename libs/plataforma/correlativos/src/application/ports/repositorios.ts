import type { Serie } from '../../domain/serie.js';

/**
 * Series del tenant del contexto, dentro de la transacción activa. Bloqueo optimista por `version`:
 * un cambio concurrente da ConflictError.
 */
export interface RepositorioSeries {
  buscar(id: string): Promise<Serie | null>;
  /** SerieDuplicadaError si ya existe empresa, tipo y serie. */
  insertar(serie: Serie): Promise<void>;
  /** Solo escribe estado, versión, actor y fecha: nunca el contador ni el periodo, que avanza seq.siguiente. */
  guardarEstado(serie: Serie): Promise<void>;
}

export interface UbicacionUnidad {
  empresaId: string;
  /** null si es un almacén sin sucursal. */
  sucursalId: string | null;
}

/** Lectura de org en el tenant del contexto. null si no existe o es de otro tenant (RLS). */
export interface UbicacionesSerie {
  sucursalDeUnidad(unidadId: string): Promise<UbicacionUnidad | null>;
  empresaDeSucursal(sucursalId: string): Promise<string | null>;
}
