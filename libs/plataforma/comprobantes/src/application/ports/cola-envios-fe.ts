/** Un trabajo de la cola `fe-envios`: el worker lee el comprobante con el contexto de su tenant. */
export interface TrabajoEnvioFe {
  tenantId: string;
  comprobanteId: string;
}

export interface ColaEnviosFe {
  /** jobId = comprobanteId: un `cpe.emitido` reentregado no encola otro envío. */
  encolar(trabajo: TrabajoEnvioFe): Promise<void>;
}

/** Del trabajo en curso, para saber si un ERROR_TECNICO agota los reintentos de BullMQ. */
export interface IntentoTrabajoEnvio {
  numero: number;
  esUltimo: boolean;
}
