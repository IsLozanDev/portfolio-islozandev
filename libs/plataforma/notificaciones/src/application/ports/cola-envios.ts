/** Un trabajo de la cola `not-envios`: el worker lee el mensaje con el contexto de su tenant. */
export interface TrabajoEnvio {
  tenantId: string;
  mensajeId: string;
}

export interface ColaEnvios {
  /** Idempotente por `mensajeId`. `retardoMs` > 0 para los programados. */
  encolar(trabajo: TrabajoEnvio, retardoMs: number): Promise<void>;
}

/** Del trabajo en curso, para saber si un error temporal agota los reintentos. */
export interface IntentoEnCurso {
  numero: number;
  esUltimo: boolean;
}
