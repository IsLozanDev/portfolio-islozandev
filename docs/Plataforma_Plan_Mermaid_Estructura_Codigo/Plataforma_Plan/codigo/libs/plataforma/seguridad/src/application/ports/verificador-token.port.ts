import type { Principal } from '../../domain/principal.js';

/** Puerto: valida un token de acceso y devuelve el principal. Hoy Supabase Auth; mañana otro IdP. */
export interface VerificadorToken {
  verificar(token: string): Promise<Principal>;
}
export const VERIFICADOR_TOKEN = Symbol('VERIFICADOR_TOKEN');
