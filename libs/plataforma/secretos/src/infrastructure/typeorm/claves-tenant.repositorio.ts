import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EntityManager } from 'typeorm';
import type { ClaveTenantGuardada, RepositorioClavesTenant } from '../../application/ports/repositorio-claves-tenant.js';
import { ClaveTenantEntidad } from './entidades.js';
import { cambiosDeEnvoltura, claveDesdeFila, filaDesdeClave } from './mapeo.js';

/** sec.clave_tenant sobre el EntityManager de la transacción activa. Filtra por el tenant del contexto además de la RLS (regla 3). */
export class RepositorioClavesTenantTypeOrm implements RepositorioClavesTenant {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async obtener(): Promise<ClaveTenantGuardada | null> {
    const fila = await this.manager.getRepository(ClaveTenantEntidad).findOneBy({ tenantId: this.tenantId });
    return fila ? claveDesdeFila(fila) : null;
  }

  /**
   * ON CONFLICT DO NOTHING: si otra transacción insertó la clave del tenant, el INSERT espera a que confirme y no
   * hace nada; la relectura (READ COMMITTED) ve la que ganó.
   */
  async crearSiNoExiste(clave: ClaveTenantGuardada): Promise<ClaveTenantGuardada> {
    await this.manager
      .createQueryBuilder()
      .insert()
      .into(ClaveTenantEntidad)
      .values(filaDesdeClave(clave))
      .orIgnore()
      .execute();
    const guardada = await this.obtener();
    if (!guardada) throw new Error('La clave del tenant debía existir después de crearla');
    return guardada;
  }

  async reenvolver(clave: ClaveTenantGuardada): Promise<void> {
    await this.manager.getRepository(ClaveTenantEntidad).update({ tenantId: this.tenantId }, cambiosDeEnvoltura(clave));
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
