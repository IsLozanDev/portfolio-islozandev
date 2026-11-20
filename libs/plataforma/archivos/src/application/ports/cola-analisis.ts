/** Sin `numero`: la versión 1 (los trabajos encolados antes del spec 35 siguen valiendo). */
export interface TrabajoAnalisis {
  tenantId: string;
  archivoId: string;
  numero?: number;
}

/** Encolar dos veces la misma versión mientras su trabajo sigue vivo deja un solo trabajo. */
export interface ColaAnalisis {
  encolar(trabajo: TrabajoAnalisis): Promise<void>;
}
