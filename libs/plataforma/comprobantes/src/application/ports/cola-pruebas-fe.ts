/** Un trabajo de la cola `fe-pruebas`: el worker lee el emisor con el contexto de su tenant. */
export interface TrabajoPruebaFe {
  tenantId: string;
  emisorId: string;
  numeroPrueba: number;
}

export interface ColaPruebasFe {
  /** jobId = `${emisorId}-${numeroPrueba}` (BullMQ no admite `:` en un id propio); repetido no duplica. */
  encolar(prueba: TrabajoPruebaFe): Promise<void>;
}

/** Del trabajo en curso, para saber si un ERROR_TECNICO agota los reintentos. */
export interface IntentoPrueba {
  numero: number;
  esUltimo: boolean;
}
