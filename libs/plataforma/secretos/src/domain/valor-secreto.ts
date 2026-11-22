import { ValorSecretoInvalidoError } from './errores.js';

/** 64 KiB: un `.pfx` (RF-052 lo limita a 50 KB) entra con margen. */
export const BYTES_MAXIMOS_VALOR = 64 * 1024;

export function exigirValorSecreto(valor: Uint8Array): void {
  if (valor.length === 0 || valor.length > BYTES_MAXIMOS_VALOR) throw new ValorSecretoInvalidoError(BYTES_MAXIMOS_VALOR);
}
