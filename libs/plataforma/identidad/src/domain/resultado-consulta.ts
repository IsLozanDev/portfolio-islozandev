// Mismos valores que el CHECK de idn.consulta_log.resultado.
export const RESULTADOS_CONSULTA = [
  'CACHE',
  'PROVEEDOR',
  'NO_ENCONTRADO',
  'INVALIDO',
  'CUOTA_AGOTADA',
  'PROVEEDOR_NO_DISPONIBLE',
] as const;

export type ResultadoConsulta = (typeof RESULTADOS_CONSULTA)[number];
