/**
 * Respuesta común de un PSE u OSE a un comprobante enviado. `CREDENCIAL_INVALIDA`: el proveedor no procesó el
 * comprobante por la configuración del emisor (usuario o clave SOL, certificado, URL); reintentar no lo arregla.
 */
export const RESULTADOS_PSE = ['ACEPTADO', 'ACEPTADO_CON_OBSERVACIONES', 'RECHAZADO', 'ERROR_TECNICO', 'EN_PROCESO', 'CREDENCIAL_INVALIDA'] as const;
export type ResultadoPse = (typeof RESULTADOS_PSE)[number];

/** Nunca lleva el token ni la URL con credenciales. */
export interface RespuestaPse {
  resultado: ResultadoPse;
  codigo: string | null;
  descripcion: string | null;
  observaciones: string[];
  hash?: string;
  enlaces?: Record<string, string>;
  /** XML firmado enviado (SUNAT directo). El 52 lo guarda en ARC. */
  xmlFirmado?: Uint8Array;
  /** ZIP del CDR tal como lo devuelve SUNAT. El 52 lo guarda en ARC. */
  cdr?: Uint8Array;
}

export function fueAceptado(resultado: ResultadoPse): boolean {
  return resultado === 'ACEPTADO' || resultado === 'ACEPTADO_CON_OBSERVACIONES';
}
