import type { VerificadorOperador } from '@vitrina/plataforma/identidad';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { ExigirOperador } from '../org/operador.js';

const MENSAJE_IDENTIDAD = 'Solo el tenant operador puede administrar cuotas y proveedores de identidad';

/** La regla de operador de org para la consola de idn (spec 29): idn no importa org (PL-10). */
export class VerificadorOperadorIdentidad implements VerificadorOperador {
  constructor(
    private readonly exigirOperador: Pick<ExigirOperador, 'ejecutar'>,
    private readonly contexto: TenantContext,
  ) {}

  exigir(): Promise<void> {
    return this.exigirOperador.ejecutar({ tenantId: this.contexto.current().tenantId }, MENSAJE_IDENTIDAD);
  }
}
