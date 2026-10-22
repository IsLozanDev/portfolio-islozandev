import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { PreferenciaSucursal } from '../../application/ports/repositorios.js';
import { RepositorioBase } from './repositorio-base.js';

/** No toca `version`: la membresía es del spec 08 y esto no es un cambio de su ciclo de vida. */
export class PreferenciaSucursalTypeOrm extends RepositorioBase implements PreferenciaSucursal {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants);
  }

  async recordar(membresiaId: string, sucursalId: string): Promise<void> {
    await this.consultar('UPDATE seg.membresia SET ultima_sucursal_id = $1 WHERE id = $2 AND tenant_id = $3', [sucursalId, membresiaId, this.tenantId]);
  }
}
