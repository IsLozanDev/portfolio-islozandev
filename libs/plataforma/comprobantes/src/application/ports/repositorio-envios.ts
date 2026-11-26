import type { IntentoEnvio } from '../../domain/envio/intento-envio.js';

/** fe.envio sobre la transacción activa y el tenant del contexto. Solo inserción. */
export interface RepositorioEnvios {
  /** El número del próximo intento del comprobante: 1 si no tiene ninguno. */
  siguienteIntento(comprobanteId: string): Promise<number>;
  registrar(intento: IntentoEnvio): Promise<void>;
}
