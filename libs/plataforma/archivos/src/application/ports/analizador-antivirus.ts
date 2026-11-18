export interface ResultadoAntivirus {
  limpio: boolean;
  /** Nombre de la firma encontrada, cuando no está limpio. */
  firma?: string;
}

/** Si el motor no responde, lanza: el trabajo de análisis se reintenta. */
export interface AnalizadorAntivirus {
  analizar(contenido: Uint8Array): Promise<ResultadoAntivirus>;
}
