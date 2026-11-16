import type { DomainEvent, EventPublisher } from '@vitrina/plataforma/kernel';
import type {
  ConfiguracionCuota,
  CuotaNueva,
  PlanDelTenant,
  RepositorioCuotas,
  ResultadoReserva,
} from '../../src/application/ports/cuotas.js';
import type { AvisoCuota } from '../../src/domain/aviso-cuota.js';
import { VersionObsoletaError } from '../../src/domain/errores.js';
import type { EstadoCuota } from '../../src/domain/estado-cuota.js';
import type { IncluidasPorPlan, PlanCuota } from '../../src/domain/plan-cuota.js';

export const INCLUIDAS_POR_DEFECTO: IncluidasPorPlan = { BASICO: 200, PRO: 500, EMPRESA: 2000 };
export const UMBRAL_POR_DEFECTO = 80;

/** Mismo contrato que RepositorioCuotasTypeOrm, sin RLS. */
export class RepositorioCuotasMemoria implements RepositorioCuotas {
  readonly cuotas = new Map<string, EstadoCuota>();

  sembrar(cuota: Partial<EstadoCuota> & Pick<EstadoCuota, 'tenantId' | 'periodo'>): void {
    this.cuotas.set(clave(cuota.tenantId, cuota.periodo), {
      plan: 'PRO',
      incluidas: 500,
      consumidas: 0,
      avisadoUmbralEn: null,
      avisadoAgotadaEn: null,
      version: 1,
      ...cuota,
    });
  }

  obtener(tenantId: string, periodo: string): EstadoCuota | undefined {
    return this.cuotas.get(clave(tenantId, periodo));
  }

  async crearSiFalta(cuota: CuotaNueva): Promise<boolean> {
    if (this.obtener(cuota.tenantId, cuota.periodo)) return false;
    this.sembrar({ ...cuota, consumidas: 0, version: 1 });
    return true;
  }

  async reservarUnidad(tenantId: string, periodo: string): Promise<ResultadoReserva> {
    const cuota = this.obtener(tenantId, periodo);
    if (!cuota) return 'SIN_CUOTA';
    if (cuota.consumidas >= cuota.incluidas) return 'AGOTADA';
    cuota.consumidas += 1;
    return { ...cuota };
  }

  async liberarUnidad(tenantId: string, periodo: string): Promise<void> {
    const cuota = this.obtener(tenantId, periodo);
    if (cuota && cuota.consumidas > 0) cuota.consumidas -= 1;
  }

  async marcarAviso(tenantId: string, periodo: string, aviso: AvisoCuota, en: Date): Promise<boolean> {
    const cuota = this.obtener(tenantId, periodo);
    const propiedad = aviso === 'UMBRAL' ? 'avisadoUmbralEn' : 'avisadoAgotadaEn';
    if (!cuota || cuota[propiedad] !== null) return false;
    cuota[propiedad] = en;
    return true;
  }

  async buscar(tenantId: string, periodo: string): Promise<EstadoCuota | null> {
    const cuota = this.obtener(tenantId, periodo);
    return cuota ? { ...cuota } : null;
  }

  async guardarIncluidas(tenantId: string, periodo: string, incluidas: number, versionEsperada: number): Promise<void> {
    const cuota = this.obtener(tenantId, periodo);
    if (!cuota || cuota.version !== versionEsperada) throw new VersionObsoletaError();
    cuota.incluidas = incluidas;
    cuota.version += 1;
  }
}

export class PlanFijo implements PlanDelTenant {
  constructor(public plan: PlanCuota = 'PRO') {}
  async planVigente(): Promise<PlanCuota> {
    return this.plan;
  }
}

export class ConfiguracionCuotaFija implements ConfiguracionCuota {
  constructor(
    public incluidas: IncluidasPorPlan = INCLUIDAS_POR_DEFECTO,
    public umbral = UMBRAL_POR_DEFECTO,
  ) {}
  async incluidasPorPlan(): Promise<IncluidasPorPlan> {
    return this.incluidas;
  }
  async umbralAvisoPorcentaje(): Promise<number> {
    return this.umbral;
  }
}

export class PublicadorMemoria implements EventPublisher {
  readonly eventos: DomainEvent[] = [];
  async publish(evento: DomainEvent): Promise<void> {
    this.eventos.push(evento);
  }
  tipos(): string[] {
    return this.eventos.map((evento) => evento.eventType);
  }
}

function clave(tenantId: string, periodo: string): string {
  return `${tenantId}:${periodo}`;
}
