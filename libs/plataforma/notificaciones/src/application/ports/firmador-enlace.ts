import type { CargaEnlace } from '../../domain/enlace-preferencias.js';

/** Firma y verifica el token del enlace de preferencias (HMAC-SHA256, clave por entorno). */
export interface FirmadorEnlace {
  firmar(carga: CargaEnlace): string;
  /** null si la firma no coincide, el formato es inválido o venció. Nunca lanza con datos del token. */
  verificar(token: string, ahora: Date): CargaEnlace | null;
}
