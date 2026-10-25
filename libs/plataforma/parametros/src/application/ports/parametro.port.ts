import type { OrigenValor } from '../../domain/tipos.js';

export const PARAMETRO_PORT = Symbol('ParametroPort');

/** Sin empresa ni sucursal se usa la sucursal del contexto, si la hay. */
export interface ContextoParametro {
  empresaId?: string;
  sucursalId?: string;
}

/**
 * TR-RF-032. Única vía de los productos para leer parámetros (TR-RNF-119). El tenant sale del
 * TenantContext. ParametroNoDefinidoError si el código no existe (TR-CA-085).
 */
export interface ParametroPort {
  valor<T = unknown>(codigo: string, contexto?: ContextoParametro): Promise<{ valor: T; origen: OrigenValor }>;
}
