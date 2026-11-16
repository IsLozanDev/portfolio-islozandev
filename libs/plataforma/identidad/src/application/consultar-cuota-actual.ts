import type { Clock, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { porcentajeConsumo } from '../domain/estado-cuota.js';
import { periodoDe, type Periodo } from '../domain/periodo.js';
import { incluidasDe, type PlanCuota } from '../domain/plan-cuota.js';
import type { ConfiguracionCuota, PlanDelTenant, RepositorioCuotas } from './ports/cuotas.js';

export interface DependenciasCuotaActual {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  repositorio: Pick<RepositorioCuotas, 'buscar'>;
  planDelTenant: PlanDelTenant;
  configuracion: ConfiguracionCuota;
}

export interface CuotaActual {
  periodo: Periodo;
  plan: PlanCuota;
  incluidas: number;
  consumidas: number;
  porcentaje: number;
  umbralAviso: number;
}

/** Cuota del tenant del contexto en el mes actual. Sin fila responde la que tendría, sin crearla: un GET no escribe. */
export class ConsultarCuotaActual {
  constructor(private readonly dependencias: DependenciasCuotaActual) {}

  ejecutar(): Promise<CuotaActual> {
    const { unidadDeTrabajo, contexto, reloj, configuracion } = this.dependencias;
    const periodo = periodoDe(reloj.now());
    const { tenantId } = contexto.current();

    return unidadDeTrabajo.run(async () => {
      const { plan, incluidas, consumidas } = (await this.dependencias.repositorio.buscar(tenantId, periodo)) ?? (await this.cuotaSinAbrir());
      const umbralAviso = await configuracion.umbralAvisoPorcentaje();
      return { periodo, plan, incluidas, consumidas, porcentaje: porcentajeConsumo({ incluidas, consumidas }), umbralAviso };
    });
  }

  private async cuotaSinAbrir(): Promise<Pick<CuotaActual, 'plan' | 'incluidas' | 'consumidas'>> {
    const plan = await this.dependencias.planDelTenant.planVigente();
    const incluidas = incluidasDe(plan, await this.dependencias.configuracion.incluidasPorPlan());
    return { plan, incluidas, consumidas: 0 };
  }
}
