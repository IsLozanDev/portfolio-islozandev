import type { Serie } from '../../domain/serie.js';
import type { SolicitudNumero } from './correlativo.port.js';

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

export interface FilaNumerada {
  serie: string;
  numero: bigint;
  digitos: number;
}

/** Numeración con la función seq.siguiente, en la transacción activa del llamador. */
export interface NumeracionSql {
  /** null si la serie no existe, está inactiva o es de otro tenant. SerieAgotadaError si llegó a su máximo. */
  siguiente(tenantId: string, solicitud: SolicitudNumero, instante: Date): Promise<FilaNumerada | null>;
  /** Distingue por qué siguiente no devolvió fila: 'INACTIVA', o null si no existe en el tenant. */
  estado(tenantId: string, solicitud: SolicitudNumero): Promise<'INACTIVA' | null>;
}
