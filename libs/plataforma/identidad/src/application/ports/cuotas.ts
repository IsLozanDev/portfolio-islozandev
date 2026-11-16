import type { AvisoCuota } from '../../domain/aviso-cuota.js';
import type { EstadoCuota } from '../../domain/estado-cuota.js';
import type { Periodo } from '../../domain/periodo.js';
import type { IncluidasPorPlan, PlanCuota } from '../../domain/plan-cuota.js';
import type { ResultadoConsulta } from '../../domain/resultado-consulta.js';

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

/** Tenants en estado ACTIVO, para la tarea mensual. Adaptador en el worker (ORG). */
export interface TenantsActivos {
  listar(): AsyncIterable<string>;
}

/** Fila de la consola de cuotas: la cuota más el nombre del tenant. */
export interface FilaCuotaConsola {
  tenantId: string;
  tenantNombre: string;
  plan: PlanCuota;
  incluidas: number;
  consumidas: number;
  avisadoUmbralEn: Date | null;
  avisadoAgotadaEn: Date | null;
  version: number;
}

export interface FiltroCuotasConsola {
  periodo: Periodo;
  /** Busca en el nombre o el código del tenant. */
  q?: string;
  limite: number;
  desplazamiento: number;
}

export interface PaginaCuotasConsola {
  filas: FilaCuotaConsola[];
  /** Filas que cumplen el filtro, sin paginar. */
  total: number;
}

export type ConsultasPorResultado = Record<ResultadoConsulta, number>;

export interface DetalleCuota extends FilaCuotaConsola {
  periodo: Periodo;
  creadaEn: Date;
  consultasPorResultado: ConsultasPorResultado;
}

/** Lectura entre tenants por las funciones SECURITY DEFINER de 01k_idn_cuota. Solo para el operador. */
export interface LecturaCuotasConsola {
  delPeriodo(filtro: FiltroCuotasConsola): Promise<PaginaCuotasConsola>;
  detalle(tenantId: string, periodo: Periodo): Promise<DetalleCuota | null>;
}

/** El actor del contexto debe ser del tenant operador: OPERADOR_REQUERIDO (403). Lo implementa apps/api con org. */
export interface VerificadorOperador {
  exigir(): Promise<void>;
}
