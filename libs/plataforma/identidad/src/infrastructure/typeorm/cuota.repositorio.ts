import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { IsNull, type Repository } from 'typeorm';
import type { CuotaNueva, RepositorioCuotas, ResultadoReserva } from '../../application/ports/cuotas.js';
import type { AvisoCuota } from '../../domain/aviso-cuota.js';
import { VersionObsoletaError } from '../../domain/errores.js';
import type { EstadoCuota } from '../../domain/estado-cuota.js';
import type { Periodo } from '../../domain/periodo.js';
import type { PlanCuota } from '../../domain/plan-cuota.js';
import { CuotaEntidad, type FilaCuota } from './entidades.js';

const PROPIEDAD_DEL_AVISO = {
  UMBRAL: 'avisadoUmbralEn',
  AGOTADA: 'avisadoAgotadaEn',
} as const satisfies Record<AvisoCuota, keyof FilaCuota>;

/** idn.cuota sobre el EntityManager de la transacción activa; la RLS la limita al tenant del contexto. */
export class RepositorioCuotasTypeOrm implements RepositorioCuotas {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async crearSiFalta({ tenantId, periodo, plan, incluidas }: CuotaNueva): Promise<boolean> {
    const resultado = await this.unidadDeTrabajo.manager
      .createQueryBuilder()
      .insert()
      .into(CuotaEntidad)
      .values({ tenantId, periodo, plan, incluidas })
      .orIgnore()
      .returning('tenant_id')
      .execute();
    return (resultado.raw as unknown[]).length > 0;
  }

  /**
   * Incremento condicional en una sola sentencia: dos reservas concurrentes no pasan el tope. La fila queda
   * bloqueada por el UPDATE hasta el commit, así que la lectura siguiente ve la propia reserva y ninguna otra.
   */
  async reservarUnidad(tenantId: string, periodo: Periodo): Promise<ResultadoReserva> {
    const resultado = await this.unidadDeTrabajo.manager
      .createQueryBuilder()
      .update(CuotaEntidad)
      .set({ consumidas: () => 'consumidas + 1' })
      .where({ tenantId, periodo })
      .andWhere('consumidas < incluidas')
      .execute();
    if (resultado.affected === 1) return this.leer(tenantId, periodo);
    return (await this.cuotas().existsBy({ tenantId, periodo })) ? 'AGOTADA' : 'SIN_CUOTA';
  }

  async liberarUnidad(tenantId: string, periodo: Periodo): Promise<void> {
    await this.unidadDeTrabajo.manager
      .createQueryBuilder()
      .update(CuotaEntidad)
      .set({ consumidas: () => 'consumidas - 1' })
      .where({ tenantId, periodo })
      .andWhere('consumidas > 0')
      .execute();
  }

  async marcarAviso(tenantId: string, periodo: Periodo, aviso: AvisoCuota, en: Date): Promise<boolean> {
    const propiedad = PROPIEDAD_DEL_AVISO[aviso];
    const resultado = await this.cuotas().update({ tenantId, periodo, [propiedad]: IsNull() }, { [propiedad]: en });
    return resultado.affected === 1;
  }

  async buscar(tenantId: string, periodo: Periodo): Promise<EstadoCuota | null> {
    const fila = await this.cuotas().findOneBy({ tenantId, periodo });
    return fila ? estadoDesdeFila(fila) : null;
  }

  async guardarIncluidas(tenantId: string, periodo: Periodo, incluidas: number, versionEsperada: number): Promise<void> {
    const resultado = await this.cuotas().update(
      { tenantId, periodo, version: versionEsperada },
      { incluidas, version: versionEsperada + 1 },
    );
    if (resultado.affected !== 1) throw new VersionObsoletaError();
  }

  private async leer(tenantId: string, periodo: Periodo): Promise<EstadoCuota> {
    return estadoDesdeFila(await this.cuotas().findOneByOrFail({ tenantId, periodo }));
  }

  private cuotas(): Repository<FilaCuota> {
    return this.unidadDeTrabajo.manager.getRepository(CuotaEntidad);
  }
}

// El CHECK de idn.cuota.plan garantiza que el texto es un PlanCuota.
function estadoDesdeFila(fila: FilaCuota): EstadoCuota {
  return {
    tenantId: fila.tenantId,
    periodo: fila.periodo,
    plan: fila.plan as PlanCuota,
    incluidas: fila.incluidas,
    consumidas: fila.consumidas,
    avisadoUmbralEn: fila.avisadoUmbralEn,
    avisadoAgotadaEn: fila.avisadoAgotadaEn,
    version: fila.version,
  };
}
