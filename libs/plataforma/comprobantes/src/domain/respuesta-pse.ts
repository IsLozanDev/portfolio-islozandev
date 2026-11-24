/** Respuesta común de un PSE u OSE a un comprobante enviado. */
export const RESULTADOS_PSE = ['ACEPTADO', 'ACEPTADO_CON_OBSERVACIONES', 'RECHAZADO', 'ERROR_TECNICO', 'EN_PROCESO'] as const;
export type ResultadoPse = (typeof RESULTADOS_PSE)[number];

/** Nunca lleva el token ni la URL con credenciales. */
export interface RespuestaPse {
  resultado: ResultadoPse;
  codigo: string | null;
  descripcion: string | null;
  observaciones: string[];
  hash?: string;
  enlaces?: Record<string, string>;
}

export function fueAceptado(resultado: ResultadoPse): boolean {
  return resultado === 'ACEPTADO' || resultado === 'ACEPTADO_CON_OBSERVACIONES';
}
