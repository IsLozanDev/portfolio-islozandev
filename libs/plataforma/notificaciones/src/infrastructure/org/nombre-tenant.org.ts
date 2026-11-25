import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { RepositorioTenants } from '@vitrina/plataforma/org';
import type { NombreTenant } from '../../application/ports/nombre-tenant.js';

/** Lee el nombre del tenant del contexto con el repositorio de ORG, dentro de la transacción del llamador. */
export class NombreTenantOrg implements NombreTenant {
  constructor(
    private readonly tenants: Pick<RepositorioTenants, 'buscar'>,
    private readonly contexto: TenantContext,
  ) {}

  async obtener(): Promise<string | null> {
    const tenant = await this.tenants.buscar(this.contexto.current().tenantId);
    return tenant?.nombre ?? null;
  }
}
