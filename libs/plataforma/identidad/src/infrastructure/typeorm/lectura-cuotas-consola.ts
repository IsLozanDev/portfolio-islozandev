import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type {
  ConsultasPorResultado,
  DetalleCuota,
  FilaCuotaConsola,
  FiltroCuotasConsola,
  LecturaCuotasConsola,
  PaginaCuotasConsola,
} from '../../application/ports/cuotas.js';
import type { Periodo } from '../../domain/periodo.js';
import type { PlanCuota } from '../../domain/plan-cuota.js';

// SQL crudo permitido (regla 11): son funciones SECURITY DEFINER de 01k_idn_cuota, que el ORM no expresa.
const CUOTAS_DEL_PERIODO = 'SELECT * FROM idn.cuotas_del_periodo($1, $2, $3, $4)';
const CUOTA_DETALLE = 'SELECT * FROM idn.cuota_detalle($1, $2)';

interface FilaFuncion {
  tenant_id: string;
  tenant_nombre: string;
  plan: string;
  incluidas: number;
  consumidas: number;
  avisado_umbral_en: Date | null;
  avisado_agotada_en: Date | null;
  version: number;
}

interface FilaListado extends FilaFuncion {
  /** count(*) OVER (): bigint, node-pg lo devuelve como string. */
  total: string;
}

interface FilaDetalle extends FilaFuncion {
  periodo: string;
  creada_en: Date;
  consultas_por_resultado: Record<string, string | number>;
}

/** Lectura entre tenants de la consola del operador; corre en la transacción activa sin depender de app.tenant_id. */
export class LecturaCuotasConsolaTypeOrm implements LecturaCuotasConsola {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async delPeriodo({ periodo, q, limite, desplazamiento }: FiltroCuotasConsola): Promise<PaginaCuotasConsola> {
    const filas: FilaListado[] = await this.unidadDeTrabajo.manager.query(CUOTAS_DEL_PERIODO, [periodo, q ?? null, limite, desplazamiento]);
    return { filas: filas.map(filaConsola), total: filas.length > 0 ? Number(filas[0].total) : 0 };
  }

  async detalle(tenantId: string, periodo: Periodo): Promise<DetalleCuota | null> {
    const [fila]: FilaDetalle[] = await this.unidadDeTrabajo.manager.query(CUOTA_DETALLE, [tenantId, periodo]);
    if (!fila) return null;
    return {
      ...filaConsola(fila),
      periodo: fila.periodo,
      creadaEn: fila.creada_en,
      consultasPorResultado: contadores(fila.consultas_por_resultado),
    };
  }
}

// El CHECK de idn.cuota.plan garantiza que el texto es un PlanCuota.
function filaConsola(fila: FilaFuncion): FilaCuotaConsola {
  return {
    tenantId: fila.tenant_id,
    tenantNombre: fila.tenant_nombre,
    plan: fila.plan as PlanCuota,
    incluidas: fila.incluidas,
    consumidas: fila.consumidas,
    avisadoUmbralEn: fila.avisado_umbral_en,
    avisadoAgotadaEn: fila.avisado_agotada_en,
    version: fila.version,
  };
}

/** jsonb_object_agg de count(*): la función siempre trae las seis claves de RESULTADOS_CONSULTA. */
function contadores(crudos: Record<string, string | number>): ConsultasPorResultado {
  return Object.fromEntries(Object.entries(crudos).map(([resultado, cantidad]) => [resultado, Number(cantidad)])) as ConsultasPorResultado;
}
