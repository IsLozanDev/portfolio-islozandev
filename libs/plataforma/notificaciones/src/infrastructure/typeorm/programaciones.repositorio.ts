import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { QueryFailedError, type EntityManager, type FindOptionsWhere } from 'typeorm';
import type { RepositorioProgramaciones } from '../../application/ports/repositorios.js';
import { ProgramacionModificadaError } from '../../domain/errores.js';
import type { Programacion } from '../../domain/programacion.js';
import type { ReferenciaProgramacion } from '../../domain/referencia-programacion.js';
import { ProgramacionEntidad, type FilaProgramacion } from './entidades.js';
import { cambiosDeProgramacion, filaDesdeProgramacion, programacionDesdeFila } from './mapeo-programacion.js';

const VIOLACION_UNICA = '23505';
const ESTADO_VIVA = 'PROGRAMADA';

/** ntf.programacion sobre el EntityManager activo. Filtra por el tenant además de la RLS (regla 3). */
export class RepositorioProgramacionesTypeOrm implements RepositorioProgramaciones {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async obtener(programacionId: string): Promise<Programacion | null> {
    const fila = await this.manager.getRepository(ProgramacionEntidad).findOneBy({ id: programacionId, tenantId: this.tenantId });
    return fila ? programacionDesdeFila(fila) : null;
  }

  async vivas(referencia: ReferenciaProgramacion, plantillaCodigo?: string): Promise<Programacion[]> {
    const filtro: FindOptionsWhere<FilaProgramacion> = {
      tenantId: this.tenantId,
      referenciaTipo: referencia.tipo,
      referenciaId: referencia.id,
      estado: ESTADO_VIVA,
      ...(plantillaCodigo === undefined ? {} : { plantillaCodigo }),
    };
    const filas = await this.manager.getRepository(ProgramacionEntidad).find({ where: filtro, order: { enviarEn: 'ASC' } });
    return filas.map(programacionDesdeFila);
  }

  /** El índice único de la viva detecta otra programación concurrente de la misma referencia y plantilla. */
  async insertar(programacion: Programacion): Promise<void> {
    try {
      await this.manager.getRepository(ProgramacionEntidad).insert(filaDesdeProgramacion(programacion));
    } catch (error) {
      if (esViolacionUnica(error)) throw new ProgramacionModificadaError();
      throw error;
    }
  }

  async actualizar(programacion: Programacion, versionEsperada: number): Promise<void> {
    const resultado = await this.manager
      .getRepository(ProgramacionEntidad)
      .update({ id: programacion.id, tenantId: this.tenantId, version: versionEsperada }, cambiosDeProgramacion(programacion));
    if (resultado.affected !== 1) throw new ProgramacionModificadaError();
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

function esViolacionUnica(error: unknown): boolean {
  return error instanceof QueryFailedError && (error.driverError as { code?: string }).code === VIOLACION_UNICA;
}
