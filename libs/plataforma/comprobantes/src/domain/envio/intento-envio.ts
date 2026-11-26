import { recortar } from '../recortar.js';

/** Los mismos que el CHECK de fe.envio.resultado. `NO_ENVIADO`: la configuración impidió llamar al proveedor. */
export const RESULTADOS_ENVIO = ['ACEPTADO', 'ACEPTADO_CON_OBSERVACIONES', 'RECHAZADO', 'ERROR_TECNICO', 'CREDENCIAL_INVALIDA', 'NO_ENVIADO'] as const;
export type ResultadoEnvio = (typeof RESULTADOS_ENVIO)[number];

/** Los largos de las columnas de fe.envio. */
const LARGO_MAXIMO_CODIGO = 20;
const LARGO_MAXIMO_DESCRIPCION = 500;

/** Un intento de envío (EnvioPse de T-06). `intento` cuenta los de todo el comprobante, no los de un trabajo. */
export interface IntentoEnvio {
  id: string;
  tenantId: string;
  comprobanteId: string;
  intento: number;
  proveedor: string;
  resultado: ResultadoEnvio;
  codigo: string | null;
  descripcion: string | null;
  enviadoEn: Date;
  /** Nulo si no se llamó al proveedor. */
  duracionMs: number | null;
}

/** Recorta lo que llega del proveedor al largo de las columnas. */
export function nuevoIntento(datos: IntentoEnvio): IntentoEnvio {
  return {
    ...datos,
    codigo: recortar(datos.codigo, LARGO_MAXIMO_CODIGO),
    descripcion: recortar(datos.descripcion, LARGO_MAXIMO_DESCRIPCION),
  };
}
