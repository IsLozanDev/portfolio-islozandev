import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { Brackets, type Repository, type SelectQueryBuilder } from 'typeorm';
import type { RepositorioFeriados } from '../../application/ports/feriados.js';
import { SucursalNoEncontradaError } from '../../domain/feriados/errores.js';
import type { Feriado } from '../../domain/feriados/feriado.js';
import { FeriadoEntidad, type FilaFeriado } from './entidades.js';
import { esUuid, esViolacionDeLlaveForanea } from './errores-sql.js';
import { feriadoDesdeFila, filaDesdeFeriado } from './mapeo-feriado.js';

// SQL crudo (regla 11): la regla de duplicado cruza niveles y recurrencia en una consulta, y la app no
// escribe feriados globales; lo hacen funciones SECURITY DEFINER de cat_editor.
const CHOCA = 'SELECT cat.feriado_choca($1, $2, $3, $4, $5) AS choca';
const GUARDAR_GLOBAL = 'SELECT cat.guardar_feriado_global($1, $2, $3, $4, $5, $6) AS version';
const ELIMINAR_GLOBAL = 'SELECT cat.eliminar_feriado_global($1, $2) AS eliminado';

/**
 * Feriados globales y del tenant del contexto. La RLS no deja ver los de otros tenants; las consultas y
 * escrituras filtran además por tenant (regla 3).
 */
export class FeriadosRepositorioTypeOrm implements RepositorioFeriados {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async buscar(id: string): Promise<Feriado | null> {
    if (!esUuid(id)) return null;
    const fila = await this.globalesYDelTenant().andWhere('feriado.id = :id', { id }).getOne();
    return fila ? feriadoDesdeFila(fila) : null;
  }

  async choca(feriado: Feriado, excluirId: string | null): Promise<boolean> {
    const [{ choca }] = await this.unidadDeTrabajo.manager.query(CHOCA, [
      feriado.alcance,
      feriado.sucursalId,
      feriado.fecha,
      feriado.recurrenteAnual,
      excluirId,
    ]);
    return choca === true;
  }

  async guardarDelTenant(feriado: Feriado, versionAnterior: number | null): Promise<boolean> {
    try {
      if (versionAnterior === null) {
        await this.feriados().insert(filaDesdeFeriado(feriado, feriado.version));
        return true;
      }
      const { fecha, nombre, recurrenteAnual, version, modificadoPor, modificadoEn } = filaDesdeFeriado(feriado, versionAnterior + 1);
      const resultado = await this.feriados().update(
        { id: feriado.id, tenantId: this.tenantId(), version: String(versionAnterior) },
        { fecha, nombre, recurrenteAnual, version, modificadoPor, modificadoEn },
      );
      return resultado.affected === 1;
    } catch (error) {
      // La FK compuesta (tenant_id, sucursal_id) es la única que la app puede violar al escribir.
      if (esViolacionDeLlaveForanea(error)) throw new SucursalNoEncontradaError();
      throw error;
    }
  }

  async eliminarDelTenant(id: string, version: number): Promise<boolean> {
    const resultado = await this.feriados().delete({ id, tenantId: this.tenantId(), version: String(version) });
    return resultado.affected === 1;
  }

  async guardarGlobal(feriado: Feriado, versionAnterior: number | null): Promise<boolean> {
    const [{ version }] = await this.unidadDeTrabajo.manager.query(GUARDAR_GLOBAL, [
      feriado.id,
      versionAnterior,
      feriado.fecha,
      feriado.nombre,
      feriado.recurrenteAnual,
      feriado.modificadoPor,
    ]);
    return version !== null;
  }

  async eliminarGlobal(id: string, version: number): Promise<boolean> {
    const [{ eliminado }] = await this.unidadDeTrabajo.manager.query(ELIMINAR_GLOBAL, [id, version]);
    return eliminado === true;
  }

  async delAnio(anio: number, sucursalId: string | null): Promise<Feriado[]> {
    const consulta = this.globalesYDelTenant()
      .andWhere(
        new Brackets((aplica) =>
          aplica
            .where('feriado.recurrenteAnual = false AND feriado.fecha BETWEEN :inicio AND :fin')
            .orWhere('feriado.recurrenteAnual = true AND feriado.fecha <= :fin'),
        ),
        { inicio: `${anio}-01-01`, fin: `${anio}-12-31` },
      );
    if (sucursalId !== null) {
      consulta.andWhere(
        new Brackets((sucursal) => sucursal.where('feriado.sucursalId IS NULL').orWhere('feriado.sucursalId = :sucursalId', { sucursalId })),
      );
    }
    return (await consulta.getMany()).map(feriadoDesdeFila);
  }

  private globalesYDelTenant(): SelectQueryBuilder<FilaFeriado> {
    return this.feriados()
      .createQueryBuilder('feriado')
      .where(
        new Brackets((dueno) => dueno.where('feriado.tenantId IS NULL').orWhere('feriado.tenantId = :tenantId', { tenantId: this.tenantId() })),
      );
  }

  private tenantId(): string {
    return this.contexto.current().tenantId;
  }

  private feriados(): Repository<FilaFeriado> {
    return this.unidadDeTrabajo.manager.getRepository(FeriadoEntidad);
  }
}
