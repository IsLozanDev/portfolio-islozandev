import type { DocumentoElectronico } from '../../domain/documento-electronico.js';
import type { AmbienteEmisor } from '../../domain/estado-emisor.js';
import type { RespuestaPse } from '../../domain/respuesta-pse.js';

export interface CredencialesPse {
  url: string | null;
  usuario: string | null;
  /** Leído de la bóveda en el worker al enviar; no se registra en ningún log, error ni evento. */
  token: string;
  ambiente: AmbienteEmisor;
}

/** Contrato a nivel de comprobante de dominio: un adaptador OSE o SUNAT directo (51b) se agrega sin tocar el dominio. */
export interface PseOsePort {
  /** Nunca lanza por rechazo: RECHAZADO es respuesta. Timeout, red, 5xx, 429 y circuito abierto → ERROR_TECNICO. */
  enviarComprobante(credenciales: CredencialesPse, documento: DocumentoElectronico): Promise<RespuestaPse>;
}

export interface ResolutorPse {
  /** ProveedorFeInvalidoError si no hay adaptador para el código. */
  para(proveedor: string): PseOsePort;
}
