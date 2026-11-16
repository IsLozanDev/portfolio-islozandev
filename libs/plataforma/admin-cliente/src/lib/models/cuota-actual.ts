export type PlanCuota = 'BASICO' | 'PRO' | 'EMPRESA';
export type EstadoCuota = 'NORMAL' | 'EN_AVISO' | 'AGOTADA';

/** Consumo DNI/RUC del propio tenant en el mes actual (spec 29). */
export interface CuotaActual {
  periodo: string;
  plan: PlanCuota;
  incluidas: number;
  consumidas: number;
  porcentaje: number;
  umbralAviso: number;
}

/** `CuotaActualDto` de la API. */
export interface CuotaActualRespuesta {
  periodo: string;
  plan: PlanCuota;
  incluidas: number;
  consumidas: number;
  porcentaje: number;
  umbral_aviso: number;
}

export function aCuotaActual(respuesta: CuotaActualRespuesta): CuotaActual {
  return {
    periodo: respuesta.periodo,
    plan: respuesta.plan,
    incluidas: respuesta.incluidas,
    consumidas: respuesta.consumidas,
    porcentaje: respuesta.porcentaje,
    umbralAviso: respuesta.umbral_aviso,
  };
}
