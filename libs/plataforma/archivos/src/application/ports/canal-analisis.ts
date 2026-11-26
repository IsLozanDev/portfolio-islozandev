import type { MotivoRechazo, MotivoRechazoVersion } from '../../domain/archivo.js';

export const RESULTADOS_SEGUIMIENTO = ['DISPONIBLE', 'CUARENTENA', 'RECHAZADO'] as const;
export type ResultadoSeguimiento = (typeof RESULTADOS_SEGUIMIENTO)[number];

const RESULTADOS: readonly string[] = RESULTADOS_SEGUIMIENTO;

/** El estado de un archivo o una versión cuyo análisis ya terminó. */
export function esResultadoSeguimiento(estado: string): estado is ResultadoSeguimiento {
  return RESULTADOS.includes(estado);
}

/** Lo que el worker publica al terminar el análisis de una carga (versión 1) o de una versión (n > 1). */
export interface ResultadoAnalisis {
  archivoId: string;
  numero: number;
  resultado: ResultadoSeguimiento;
  motivoRechazo?: MotivoRechazo | MotivoRechazoVersion;
  versionCoincidente?: number;
  mensaje?: string;
  /** Solo para autorizar el SSE: no sale al cliente. Nulo solo en un archivo `SISTEMA`, que nadie sigue. */
  subidoPor: string | null;
}

/** Del worker a la API: el resultado de cada análisis, en vivo y el último guardado por un tiempo. */
export interface CanalAnalisis {
  publicar(resultado: ResultadoAnalisis): Promise<void>;
  ultimo(archivoId: string, numero: number): Promise<ResultadoAnalisis | null>;
  suscribir(archivoId: string, numero: number, senal: AbortSignal): AsyncGenerator<ResultadoAnalisis>;
}
