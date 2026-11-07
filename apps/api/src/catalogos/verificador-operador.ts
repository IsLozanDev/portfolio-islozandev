import type { VerificadorOperador } from '@vitrina/plataforma/catalogos';
import type { ExigirOperador } from '../org/operador.js';

const MENSAJE_CATALOGOS = 'Solo el tenant operador puede administrar catálogos globales';

/** La regla de operador de org para catálogos: catalogos no importa org (TR-RNF-119). */
export class VerificadorOperadorOrg implements VerificadorOperador {
  constructor(private readonly exigirOperador: Pick<ExigirOperador, 'ejecutar'>) {}

  exigir(tenantId: string): Promise<void> {
    return this.exigirOperador.ejecutar({ tenantId }, MENSAJE_CATALOGOS);
  }
}
