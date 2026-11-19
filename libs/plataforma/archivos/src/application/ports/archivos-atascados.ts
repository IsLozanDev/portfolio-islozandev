import type { TrabajoAnalisis } from './cola-analisis.js';

/** Análisis de todos los tenants que se quedaron sin resolver, para el barrido del worker. Devuelve trabajos listos para encolar. */
export interface ArchivosAtascados {
  /**
   * Los archivos y las versiones nuevas que pasaron a `EN_ANALISIS` antes de `antes`, del más antiguo al más
   * reciente, hasta `limite`. Cada trabajo lleva el número de su versión (spec 35).
   */
  listarEnAnalisisAntesDe(antes: Date, limite: number): Promise<TrabajoAnalisis[]>;
}
