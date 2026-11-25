/** Un trabajo de la cola `not-programaciones`: el worker relee la programación con el contexto de su tenant. */
export interface TrabajoProgramacion {
  tenantId: string;
  programacionId: string;
  /** La versión al encolar: si la programación cambió después, el trabajo termina sin efecto. */
  version: number;
}

export interface ColaProgramaciones {
  /** Diferido hasta `enviarEn` (inmediato si ya pasó). Idempotente por `jobId = ${programacionId}-${version}`. */
  encolar(trabajo: TrabajoProgramacion & { enviarEn: Date }): Promise<void>;
}
