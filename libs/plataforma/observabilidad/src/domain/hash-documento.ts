import { createHash } from 'node:crypto';

const PREFIJO_HASH = 'sha256:';

/** TR-RNF-111: el número de documento solo aparece en logs como SHA-256 con sal de plataforma. */
export function hashDocumento(numero: string, sal: string): string {
  const resumen = createHash('sha256').update(`${sal}:${numero}`).digest('hex');
  return `${PREFIJO_HASH}${resumen}`;
}
