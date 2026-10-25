import type { TipoDocumento } from '../../domain/tipos.js';

export const CORRELATIVO_PORT = Symbol('CorrelativoPort');

export interface SolicitudNumero {
  empresaId: string;
  tipo: TipoDocumento;
  serie: string;
}

export interface NumeroEmitido {
  serie: string;
  numero: bigint;
  /** Con relleno de ceros a los dígitos de la serie: B002-00000125, A-001. */
  numeroFormateado: string;
}

/**
 * TR-RF-036 y TR-RF-037. Única vía de los productos para numerar (TR-RNF-119). El tenant sale del
 * TenantContext y no se evalúa `plat.serie.numerar`: es una llamada interna.
 *
 * - Corre en la transacción activa del UnitOfWork del producto; fuera de ella lanza NoActiveTransactionError.
 *   Si esa transacción se revierte, el número no se consume (TR-CA-095).
 * - Bloquea la serie hasta el commit: pedir el número al final de la transacción, justo antes de commitear.
 * - Para numerar varias series en una transacción, pedirlas en orden de `serie` (evita bloqueos mutuos).
 * - SerieNoEncontradaError, SerieInactivaError o SerieAgotadaError si no se puede numerar.
 */
export interface CorrelativoPort {
  siguiente(solicitud: SolicitudNumero): Promise<NumeroEmitido>;
}
