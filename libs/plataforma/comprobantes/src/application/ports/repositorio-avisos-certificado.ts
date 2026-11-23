import type { AvisoCertificado } from '../../domain/aviso-certificado.js';

export interface EmisorPendienteDeAviso {
  tenantId: string;
  emisorId: string;
}

export interface RepositorioAvisosCertificado {
  /** ON CONFLICT DO NOTHING sobre (emisor, huella): devuelve si insertó. En la transacción del tenant. */
  registrar(aviso: AvisoCertificado): Promise<boolean>;
  /**
   * Emisores de todos los tenants con certificado que vence antes de `hasta` y sin aviso para su huella, por id
   * y después de `despuesDe`. Fuera de toda transacción.
   */
  pendientes(hasta: Date, despuesDe: string, limite: number): Promise<EmisorPendienteDeAviso[]>;
}
