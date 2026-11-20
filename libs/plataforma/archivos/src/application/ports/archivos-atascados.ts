import type { TrabajoAnalisis } from './cola-analisis.js';

/** Análisis de todos los tenants que se quedaron sin resolver, para el barrido del worker. Devuelve trabajos listos para encolar. */
export interface ArchivosAtascados {
  /** Los archivos que pasaron a `EN_ANALISIS` antes de `antes`, del más antiguo al más reciente, hasta `limite`. */
  listarEnAnalisisAntesDe(antes: Date, limite: number): Promise<TrabajoAnalisis[]>;
}
