export type PlanCuota = 'BASICO' | 'PRO' | 'EMPRESA';
export type EstadoCuota = 'NORMAL' | 'EN_AVISO' | 'AGOTADA';

export const RESULTADOS_CONSULTA = ['CACHE', 'PROVEEDOR', 'NO_ENCONTRADO', 'INVALIDO', 'CUOTA_AGOTADA', 'PROVEEDOR_NO_DISPONIBLE'] as const;
export type ResultadoConsulta = (typeof RESULTADOS_CONSULTA)[number];

export interface FilaCuota {
  tenantId: string;
  tenantNombre: string;
  plan: PlanCuota;
  incluidas: number;
  consumidas: number;
  porcentaje: number;
  avisadoUmbralEn: string | null;
  avisadoAgotadaEn: string | null;
  version: number;
}

export interface PaginaCuotas {
  periodo: string;
  items: FilaCuota[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface DetalleCuota extends FilaCuota {
  periodo: string;
  creadaEn: string;
  consultasPorResultado: Record<ResultadoConsulta, number>;
}

/** `FilaCuotaDto` de la API (spec 29). */
export interface FilaCuotaRespuesta {
  tenant_id: string;
  tenant_nombre: string;
  plan: PlanCuota;
  incluidas: number;
  consumidas: number;
  porcentaje: number;
  avisado_umbral_en: string | null;
  avisado_agotada_en: string | null;
  version: number;
}

export interface PaginaCuotasRespuesta {
  periodo: string;
  items: FilaCuotaRespuesta[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface DetalleCuotaRespuesta extends FilaCuotaRespuesta {
  periodo: string;
  creada_en: string;
  consultas_por_resultado: Record<ResultadoConsulta, number>;
}

export function aFilaCuota(respuesta: FilaCuotaRespuesta): FilaCuota {
  return {
    tenantId: respuesta.tenant_id,
    tenantNombre: respuesta.tenant_nombre,
    plan: respuesta.plan,
    incluidas: respuesta.incluidas,
    consumidas: respuesta.consumidas,
    porcentaje: respuesta.porcentaje,
    avisadoUmbralEn: respuesta.avisado_umbral_en,
    avisadoAgotadaEn: respuesta.avisado_agotada_en,
    version: respuesta.version,
  };
}

export function aPaginaCuotas(respuesta: PaginaCuotasRespuesta): PaginaCuotas {
  return {
    periodo: respuesta.periodo,
    items: respuesta.items.map(aFilaCuota),
    total: respuesta.total,
    pagina: respuesta.pagina,
    tamano: respuesta.tamano,
  };
}

export function aDetalleCuota(respuesta: DetalleCuotaRespuesta): DetalleCuota {
  return {
    ...aFilaCuota(respuesta),
    periodo: respuesta.periodo,
    creadaEn: respuesta.creada_en,
    consultasPorResultado: { ...respuesta.consultas_por_resultado },
  };
}
