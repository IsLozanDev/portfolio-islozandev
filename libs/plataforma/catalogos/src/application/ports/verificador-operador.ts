export const VERIFICADOR_OPERADOR = Symbol('VerificadorOperador');

/**
 * Solo el tenant operador escribe catálogos e ítems globales. Lo implementa apps/api con la regla de org
 * (`ExigirOperador`): catalogos no depende de org (TR-RNF-119).
 */
export interface VerificadorOperador {
  /** Lanza `OperadorRequeridoError` (403) si el tenant no es el operador. */
  exigir(tenantId: string): Promise<void>;
}
