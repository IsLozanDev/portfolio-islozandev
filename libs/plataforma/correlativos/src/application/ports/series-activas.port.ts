import type { TipoDocumento } from '../../domain/tipos.js';

export const SERIES_ACTIVAS_PORT = Symbol('SeriesActivasPort');

/**
 * Series activas de una sucursal para quien numera desde otro componente (FE, spec 51). El tenant sale del
 * TenantContext y se une a la transacción activa; no evalúa permiso: es una llamada interna.
 */
export interface SeriesActivasPort {
  /** Códigos de serie ordenados; vacío si la sucursal no tiene series activas del tipo o es de otro tenant. */
  deSucursal(sucursalId: string, tipo: TipoDocumento): Promise<string[]>;
}
