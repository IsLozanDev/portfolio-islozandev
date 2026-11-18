export interface TrabajoAnalisis {
  tenantId: string;
  archivoId: string;
}

/** Encolar dos veces el mismo archivo mientras su trabajo sigue vivo deja un solo trabajo. */
export interface ColaAnalisis {
  encolar(trabajo: TrabajoAnalisis): Promise<void>;
}
