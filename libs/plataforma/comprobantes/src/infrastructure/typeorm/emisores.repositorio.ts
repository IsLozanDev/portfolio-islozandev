import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { QueryFailedError, type EntityManager, type FindOptionsWhere } from 'typeorm';
import type { RepositorioEmisores } from '../../application/ports/repositorio-emisores.js';
import type { Emisor } from '../../domain/emisor.js';
import { VersionObsoletaEmisorError } from '../../domain/errores.js';
import { EmisorEntidad, type FilaEmisor } from './entidades.js';
import { cambiosDeEmisor, emisorDesdeFila, filaDesdeEmisor } from './mapeo.js';

const VIOLACION_UNICA = '23505';

function esViolacionUnica(error: unknown): boolean {
  return error instanceof QueryFailedError && (error.driverError as { code?: string } | undefined)?.code === VIOLACION_UNICA;
}

/** fe.emisor sobre el EntityManager de la transacción activa. Filtra por el tenant del contexto además de la RLS (regla 3). */
export class RepositorioEmisoresTypeOrm implements RepositorioEmisores {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  porEmpresa(empresaId: string): Promise<Emisor | null> {
    return this.buscarDelTenant({ empresaId });
  }

  porId(emisorId: string): Promise<Emisor | null> {
    return this.buscarDelTenant({ id: emisorId });
  }

  /** Dos altas a la vez de la misma empresa: la segunda choca con uq_emisor_empresa y responde como versión obsoleta. */
  async insertar(emisor: Emisor): Promise<void> {
    try {
      await this.manager.getRepository(EmisorEntidad).insert(filaDesdeEmisor(emisor));
    } catch (error) {
      if (esViolacionUnica(error)) throw new VersionObsoletaEmisorError();
      throw error;
    }
  }

  async actualizar(emisor: Emisor, versionEsperada: number): Promise<void> {
    const resultado = await this.manager
      .getRepository(EmisorEntidad)
      .update({ id: emisor.id, tenantId: this.tenantId, version: versionEsperada }, cambiosDeEmisor(emisor));
    if (resultado.affected !== 1) throw new VersionObsoletaEmisorError();
  }

  private async buscarDelTenant(criterio: FindOptionsWhere<FilaEmisor>): Promise<Emisor | null> {
    const fila = await this.manager.getRepository(EmisorEntidad).findOneBy({ ...criterio, tenantId: this.tenantId });
    return fila ? emisorDesdeFila(fila) : null;
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
