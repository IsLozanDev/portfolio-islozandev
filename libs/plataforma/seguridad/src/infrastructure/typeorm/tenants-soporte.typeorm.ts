import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { TenantsSoporte } from '../../application/ports/tenants-soporte.port.js';
import { TenantCodigoEntidad } from './entidades-org.js';

export class TenantsSoporteTypeOrm implements TenantsSoporte {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async codigoDel(tenantId: string): Promise<string | null> {
    const fila = await this.unidadDeTrabajo.manager.getRepository(TenantCodigoEntidad).findOneBy({ id: tenantId });
    return fila?.codigo ?? null;
  }
}
