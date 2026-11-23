import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { IsNull, type FindOptionsWhere } from 'typeorm';
import type { RepositorioPlantillas } from '../../application/ports/repositorios.js';
import type { CanalNotificacion } from '../../domain/canal.js';
import type { Plantilla } from '../../domain/plantilla.js';
import { PlantillaEntidad, type FilaPlantilla } from './entidades.js';
import { plantillaDesdeFila } from './mapeo.js';

/** ntf.plantilla sobre el EntityManager de la transacción activa: primero la del tenant, después la base. */
export class RepositorioPlantillasTypeOrm implements RepositorioPlantillas {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async vigente(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null> {
    const filtro = { codigo, canal, idioma, activa: true };
    const fila =
      (await this.mayorVersion({ ...filtro, tenantId: this.contexto.current().tenantId })) ??
      (await this.mayorVersion({ ...filtro, tenantId: IsNull() }));
    return fila ? plantillaDesdeFila(fila) : null;
  }

  private mayorVersion(filtro: FindOptionsWhere<FilaPlantilla>): Promise<FilaPlantilla | null> {
    return this.unidadDeTrabajo.manager.getRepository(PlantillaEntidad).findOne({ where: filtro, order: { version: 'DESC' } });
  }
}
