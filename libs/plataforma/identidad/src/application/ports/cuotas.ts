import type { AvisoCuota } from '../../domain/aviso-cuota.js';
import type { EstadoCuota } from '../../domain/estado-cuota.js';
import type { Periodo } from '../../domain/periodo.js';
import type { IncluidasPorPlan, PlanCuota } from '../../domain/plan-cuota.js';

export interface CuotaNueva {
  tenantId: string;
  periodo: Periodo;
  plan: PlanCuota;
  incluidas: number;
}

export type ResultadoReserva = EstadoCuota | 'SIN_CUOTA' | 'AGOTADA';

/** idn.cuota sobre la transacción activa; la RLS la limita al tenant del contexto. */
export interface RepositorioCuotas {
  /** INSERT ... ON CONFLICT DO NOTHING. true si la creó. */
  crearSiFalta(cuota: CuotaNueva): Promise<boolean>;
  /** Suma una consulta en una sola sentencia atómica; con la reserva hecha devuelve la fila resultante. */
  reservarUnidad(tenantId: string, periodo: Periodo): Promise<ResultadoReserva>;
  /** Resta una consulta sin bajar de 0. */
  liberarUnidad(tenantId: string, periodo: Periodo): Promise<void>;
  /** false si el aviso ya estaba marcado: así dos reservas concurrentes no lo publican dos veces. */
  marcarAviso(tenantId: string, periodo: Periodo, aviso: AvisoCuota, en: Date): Promise<boolean>;
  buscar(tenantId: string, periodo: Periodo): Promise<EstadoCuota | null>;
  /** Bloqueo optimista: VersionObsoletaError si la versión no coincide. */
  guardarIncluidas(tenantId: string, periodo: Periodo, incluidas: number, versionEsperada: number): Promise<void>;
}

/** Plan más alto entre las suscripciones vigentes del tenant del contexto. Adaptador en las apps (ORG). */
export interface PlanDelTenant {
  planVigente(): Promise<PlanCuota>;
}

/** Parámetros de cfg. Adaptador en las apps. */
export interface ConfiguracionCuota {
  incluidasPorPlan(): Promise<IncluidasPorPlan>;
  umbralAvisoPorcentaje(): Promise<number>;
}
