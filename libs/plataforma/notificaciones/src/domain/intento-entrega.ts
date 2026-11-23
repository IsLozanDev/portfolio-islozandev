export const RESULTADOS_INTENTO = ['ACEPTADO', 'ERROR_TEMPORAL', 'ERROR_DEFINITIVO', 'CALLBACK'] as const;
export type ResultadoIntento = (typeof RESULTADOS_INTENTO)[number];

/** Un intento de entrega o un aviso del proveedor. `respuestaProveedor` nunca lleva el destino ni el cuerpo. */
export interface IntentoEntrega {
  id: string;
  tenantId: string;
  mensajeId: string;
  numero: number;
  resultado: ResultadoIntento;
  respuestaProveedor: Readonly<Record<string, string>>;
  en: Date;
}
