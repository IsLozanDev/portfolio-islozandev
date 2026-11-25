import type { Comprobante } from '../../domain/comprobante/comprobante.js';

/** Sobre la transacción activa y el tenant del contexto (regla 3). */
export interface RepositorioComprobantes {
  porClave(claveIdempotencia: string): Promise<Comprobante | null>;
  porId(comprobanteId: string): Promise<Comprobante | null>;
  /** Cabecera, líneas y cuotas. EmisionConcurrenteError si otra emisión con la misma clave confirmó primero. */
  guardar(comprobante: Comprobante): Promise<void>;
}
