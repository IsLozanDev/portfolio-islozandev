import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EntityManager } from 'typeorm';
import type { RepositorioSecretos, SecretoGuardado } from '../../application/ports/repositorio-secretos.js';
import { SecretoModificadoError } from '../../domain/errores.js';
import { SecretoEntidad } from './entidades.js';
import { cambiosDeRotacion, filaDesdeSecreto, secretoDesdeFila } from './mapeo.js';

/** sec.secreto sobre el EntityManager de la transacción activa. Filtra por el tenant del contexto además de la RLS (regla 3). */
export class RepositorioSecretosTypeOrm implements RepositorioSecretos {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async obtener(secretoId: string): Promise<SecretoGuardado | null> {
    const fila = await this.manager.getRepository(SecretoEntidad).findOneBy({ id: secretoId, tenantId: this.tenantId });
    return fila ? secretoDesdeFila(fila) : null;
  }

  async insertar(secreto: SecretoGuardado): Promise<void> {
    await this.manager.getRepository(SecretoEntidad).insert(filaDesdeSecreto(secreto));
  }

  /** La columna de versión sube sola en el UPDATE; el filtro por la versión leída es el bloqueo optimista. */
  async actualizar(secreto: SecretoGuardado, versionEsperada: number): Promise<void> {
    const resultado = await this.manager
      .getRepository(SecretoEntidad)
      .update({ id: secreto.id, tenantId: this.tenantId, version: versionEsperada }, cambiosDeRotacion(secreto));
    if (resultado.affected !== 1) throw new SecretoModificadoError();
  }

  async borrar(secretoId: string): Promise<boolean> {
    const resultado = await this.manager.getRepository(SecretoEntidad).delete({ id: secretoId, tenantId: this.tenantId });
    return resultado.affected === 1;
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
