import type { Clock, DomainEvent, EventPublisher } from '@vitrina/plataforma/kernel';
import { avisosPendientes, type AvisoCuota } from '../domain/aviso-cuota.js';
import type { EstadoCuota } from '../domain/estado-cuota.js';
import { eventoCuotaAgotada, eventoCuotaUmbralAlcanzado } from '../domain/eventos-idn.js';
import { periodoDe, type Periodo } from '../domain/periodo.js';
import { incluidasDe } from '../domain/plan-cuota.js';
import type { CuotaPort } from './ports/cuota.port.js';
import type { ConfiguracionCuota, PlanDelTenant, RepositorioCuotas } from './ports/cuotas.js';

export interface DependenciasControlCuota {
  repositorio: RepositorioCuotas;
  planDelTenant: PlanDelTenant;
  configuracion: ConfiguracionCuota;
  publicador: EventPublisher;
  reloj: Clock;
}

/**
 * TR-RF-047. Corre dentro de la transacción de quien lo llama (ConsultarDocumento): la reserva, la bitácora
 * y los avisos van juntos al outbox. El tenant de `reservar` debe ser el del contexto (RLS y plan).
 */
export class ControlCuota implements CuotaPort {
  constructor(private readonly dependencias: DependenciasControlCuota) {}

  async reservar(tenantId: string): Promise<boolean> {
    const periodo = this.periodoActual();
    const reserva = await this.reservarCreandoPeriodo(tenantId, periodo);
    if (reserva === null) return false;
    await this.publicarAvisos(reserva);
    return true;
  }

  async liberar(tenantId: string): Promise<void> {
    await this.dependencias.repositorio.liberarUnidad(tenantId, this.periodoActual());
  }

  /** Crea la cuota del periodo con las incluidas del plan vigente. true si no existía. */
  async abrirPeriodo(tenantId: string, periodo: Periodo): Promise<boolean> {
    const { planDelTenant, configuracion, repositorio } = this.dependencias;
    const plan = await planDelTenant.planVigente();
    const incluidas = incluidasDe(plan, await configuracion.incluidasPorPlan());
    return repositorio.crearSiFalta({ tenantId, periodo, plan, incluidas });
  }

  /** La cuota reservada, o null si está agotada. Sin fila del periodo la abre y reintenta una vez. */
  private async reservarCreandoPeriodo(tenantId: string, periodo: Periodo): Promise<EstadoCuota | null> {
    const { repositorio } = this.dependencias;
    let resultado = await repositorio.reservarUnidad(tenantId, periodo);
    if (resultado === 'SIN_CUOTA') {
      await this.abrirPeriodo(tenantId, periodo);
      resultado = await repositorio.reservarUnidad(tenantId, periodo);
    }
    return typeof resultado === 'string' ? null : resultado;
  }

  private async publicarAvisos(cuota: EstadoCuota): Promise<void> {
    const { configuracion, repositorio, publicador } = this.dependencias;
    const umbral = await configuracion.umbralAvisoPorcentaje();
    const ahora = this.dependencias.reloj.now();
    for (const aviso of avisosPendientes(cuota, umbral)) {
      const marcado = await repositorio.marcarAviso(cuota.tenantId, cuota.periodo, aviso, ahora);
      if (marcado) await publicador.publish(eventoDeAviso(aviso, cuota, umbral, ahora));
    }
  }

  private periodoActual(): Periodo {
    return periodoDe(this.dependencias.reloj.now());
  }
}

function eventoDeAviso(aviso: AvisoCuota, cuota: EstadoCuota, umbral: number, ahora: Date): DomainEvent {
  return aviso === 'UMBRAL' ? eventoCuotaUmbralAlcanzado(cuota, umbral, ahora) : eventoCuotaAgotada(cuota, ahora);
}
