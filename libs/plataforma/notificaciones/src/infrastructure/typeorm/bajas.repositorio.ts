import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { RepositorioBajas } from '../../application/ports/repositorios.js';
import { Baja, type AlcanceBaja } from '../../domain/baja.js';
import type { CanalNotificacion } from '../../domain/canal.js';
import { BajaEntidad, type FilaBaja } from './entidades.js';

/** ntf.baja sobre el EntityManager activo, por hash del destino. Solo inserción (02a_not_bajas). */
export class RepositorioBajasTypeOrm implements RepositorioBajas {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async delDestino(canal: CanalNotificacion, destinoHash: string): Promise<Baja[]> {
    const filas = await this.repositorio.findBy({ tenantId: this.tenantId, canal, destinoHash });
    return filas.map(aBaja);
  }

  /** `ON CONFLICT DO NOTHING` por `uq_baja`; si ya existía, devuelve la guardada. */
  async registrar(baja: Baja): Promise<Baja> {
    const datos = baja.instantanea();
    await this.unidadDeTrabajo.manager
      .createQueryBuilder()
      .insert()
      .into(BajaEntidad)
      .values({ ...datos, tenantId: this.tenantId })
      .orIgnore()
      .updateEntity(false)
      .execute();
    const guardada = await this.repositorio.findOneByOrFail({
      tenantId: this.tenantId,
      canal: datos.canal,
      alcance: datos.alcance,
      destinoHash: datos.destinoHash,
    });
    return aBaja(guardada);
  }

  private get repositorio() {
    return this.unidadDeTrabajo.manager.getRepository(BajaEntidad);
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

function aBaja(fila: FilaBaja): Baja {
  return Baja.registrar({
    id: fila.id,
    tenantId: fila.tenantId,
    canal: fila.canal as CanalNotificacion,
    alcance: fila.alcance as AlcanceBaja,
    destinoHash: fila.destinoHash,
    personaId: fila.personaId,
  });
}
