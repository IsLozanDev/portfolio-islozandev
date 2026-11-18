import { VigenciaInvalidaError } from './errores.js';

/** TR-RF-082: una URL de descarga vive 15 minutos como máximo. */
export const VIGENCIA_MAXIMA_SEGUNDOS = 900;
export const VIGENCIA_MINIMA_SEGUNDOS = 60;

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
