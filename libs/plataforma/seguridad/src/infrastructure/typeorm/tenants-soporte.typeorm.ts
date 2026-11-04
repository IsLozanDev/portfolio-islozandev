import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { DataSource } from 'typeorm';
import type { TenantsSoporte } from '../../application/ports/tenants-soporte.port.js';
import { TenantCodigoEntidad } from './entidades-org.js';

// SQL crudo justificado (regla 11): org.tenant_por_codigo es SECURITY DEFINER; la RLS de org.tenant
// no deja buscar por código fuera del propio tenant.
const TENANT_POR_CODIGO = 'SELECT org.tenant_por_codigo($1::varchar) AS id';

export class TenantsSoporteTypeOrm implements TenantsSoporte {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly dataSource: Pick<DataSource, 'query'>,
  ) {}

  async codigoDel(tenantId: string): Promise<string | null> {
    const fila = await this.unidadDeTrabajo.manager.getRepository(TenantCodigoEntidad).findOneBy({ id: tenantId });
    return fila?.codigo ?? null;
  }

  async idDelCodigo(codigo: string): Promise<string | null> {
    const [fila]: { id: string | null }[] = await this.dataSource.query(TENANT_POR_CODIGO, [codigo]);
    return fila?.id ?? null;
  }
}
