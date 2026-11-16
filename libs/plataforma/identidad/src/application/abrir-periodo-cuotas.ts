import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { Periodo } from '../domain/periodo.js';
import type { ControlCuota } from './control-cuota.js';
import type { TenantsActivos } from './ports/cuotas.js';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;

export interface DependenciasAperturaCuotas {
  tenants: TenantsActivos;
  contexto: TenantContext;
  unidadDeTrabajo: UnitOfWork;
  control: Pick<ControlCuota, 'abrirPeriodo'>;
  informar: Informar;
  avisar: Informar;
}

export interface ResultadoAperturaCuotas {
  periodo: Periodo;
  creadas: number;
  existentes: number;
  fallidas: number;
}

/**
 * Tarea mensual (TR-RF-047): abre la cuota del periodo de cada tenant ACTIVO con las incluidas de su plan.
 * Idempotente: una cuota ya abierta no cambia. Un tenant que falla queda en el log y se sigue con el siguiente.
 */
export class AbrirPeriodoCuotas {
  constructor(private readonly dependencias: DependenciasAperturaCuotas) {}

  async ejecutar(periodo: Periodo): Promise<ResultadoAperturaCuotas> {
    const resultado: ResultadoAperturaCuotas = { periodo, creadas: 0, existentes: 0, fallidas: 0 };
    for await (const tenantId of this.dependencias.tenants.listar()) {
      await this.abrirParaTenant(tenantId, periodo, resultado);
    }
    this.dependencias.informar('Cuotas de identidad abiertas', { ...resultado });
    return resultado;
  }

  /** En el contexto del tenant: la RLS de idn.cuota y el plan del tenant lo exigen. */
  private async abrirParaTenant(tenantId: string, periodo: Periodo, resultado: ResultadoAperturaCuotas): Promise<void> {
    const { contexto, unidadDeTrabajo, control, avisar } = this.dependencias;
    try {
      const creada = await contexto.run({ tenantId }, () => unidadDeTrabajo.run(() => control.abrirPeriodo(tenantId, periodo)));
      if (creada) resultado.creadas += 1;
      else resultado.existentes += 1;
    } catch (error) {
      resultado.fallidas += 1;
      avisar('Cuota de identidad de un tenant no se abrió', { tenant_id: tenantId, periodo, error: (error as Error).name });
    }
  }
}
