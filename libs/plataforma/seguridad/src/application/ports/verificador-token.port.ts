import type { Principal } from '../../domain/principal.js';

/** ADR-29: la verificación del token queda detrás de este puerto. */
export interface VerificadorToken {
  verificar(token: string): Promise<Principal>;
}

export const VERIFICADOR_TOKEN = Symbol('VERIFICADOR_TOKEN');
