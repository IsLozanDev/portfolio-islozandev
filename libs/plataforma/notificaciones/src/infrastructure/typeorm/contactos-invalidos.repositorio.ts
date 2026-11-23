import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { RepositorioContactosInvalidos } from '../../application/ports/repositorios.js';
import type { CanalNotificacion } from '../../domain/canal.js';
import { ContactoInvalidoEntidad } from './entidades.js';

/** ntf.contacto_invalido sobre el EntityManager activo, por hash del destino. */
export class RepositorioContactosInvalidosTypeOrm implements RepositorioContactosInvalidos {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  esInvalido(canal: CanalNotificacion, destinoHash: string): Promise<boolean> {
    return this.unidadDeTrabajo.manager.getRepository(ContactoInvalidoEntidad).existsBy({ tenantId: this.tenantId, canal, destinoHash });
  }

  /** El primer motivo queda: `ON CONFLICT DO NOTHING`. */
  async marcar(canal: CanalNotificacion, destinoHash: string, motivo: string): Promise<void> {
    await this.unidadDeTrabajo.manager
      .createQueryBuilder()
      .insert()
      .into(ContactoInvalidoEntidad)
      .values({ tenantId: this.tenantId, canal, destinoHash, motivo })
      .orIgnore()
      .updateEntity(false)
      .execute();
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
