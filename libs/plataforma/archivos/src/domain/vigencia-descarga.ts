import { VigenciaInvalidaError } from './errores.js';

/** TR-RF-082: una URL de descarga vive 15 minutos como máximo. */
export const VIGENCIA_MAXIMA_SEGUNDOS = 900;
export const VIGENCIA_MINIMA_SEGUNDOS = 60;

/** `attachment` descarga con el nombre original; `inline` deja que el navegador lo abra. */
export const DISPOSICIONES = ['inline', 'attachment'] as const;
export type Disposicion = (typeof DISPOSICIONES)[number];
/** Lo seguro por defecto es descargar, no abrir en el navegador. */
export const DISPOSICION_POR_DEFECTO: Disposicion = 'attachment';

/** Sin valor, la máxima. Fuera de rango o con decimales, `VigenciaInvalidaError`. */
export function resolverVigenciaDescarga(vigenciaSegundos?: number): number {
  if (vigenciaSegundos === undefined) return VIGENCIA_MAXIMA_SEGUNDOS;
  const enRango =
    Number.isInteger(vigenciaSegundos) &&
    vigenciaSegundos >= VIGENCIA_MINIMA_SEGUNDOS &&
    vigenciaSegundos <= VIGENCIA_MAXIMA_SEGUNDOS;
  if (!enRango) throw new VigenciaInvalidaError(VIGENCIA_MINIMA_SEGUNDOS, VIGENCIA_MAXIMA_SEGUNDOS);
  return vigenciaSegundos;
}
