import type { MotivoRechazo, MotivoRechazoVersion, RechazoVersion } from './archivo.js';

const IDENTICA_A_LA_VIGENTE = 'El archivo es idéntico a la versión vigente';
const PREFIJO_IDENTICA_A_OTRA = 'El archivo es idéntico a la versión';
const MENSAJES_POR_MOTIVO: Readonly<Record<Exclude<MotivoRechazoVersion, 'IDENTICA'>, string>> = {
  TIPO_NO_PERMITIDO: 'El tipo real del archivo no está permitido en su categoría',
  TAMANO_NO_COINCIDE: 'El tamaño del archivo no coincide con el declarado',
};

/** El texto del motivo de rechazo de una primera carga: los mismos que los de una versión. */
export function mensajeRechazoCarga(motivo: MotivoRechazo): string {
  return MENSAJES_POR_MOTIVO[motivo];
}

/** Se arma al consultar, con la vigente de ese momento: si cambió, el mensaje dice el número de la coincidente. */
export function mensajeRechazoVersion(rechazo: RechazoVersion, versionVigente: number | null): string {
  if (rechazo.motivo !== 'IDENTICA') return MENSAJES_POR_MOTIVO[rechazo.motivo];
  if (rechazo.versionCoincidente === versionVigente) return IDENTICA_A_LA_VIGENTE;
  return `${PREFIJO_IDENTICA_A_OTRA} ${rechazo.versionCoincidente}`;
}
