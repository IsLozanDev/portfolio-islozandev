import type { VersionArchivo } from './archivo.js';
import type { CategoriaArchivo } from './categoria.js';

export const RESULTADOS_ANALISIS = ['APROBADO', 'TAMANO_NO_COINCIDE', 'TIPO_NO_PERMITIDO', 'INFECTADO'] as const;
export type ResultadoAnalisis = (typeof RESULTADOS_ANALISIS)[number];

/** Lo que el worker midió sobre los bytes reales. `mimeReal` nulo: el detector no reconoció el contenido. */
export interface HallazgosAnalisis {
  bytes: number;
  mimeReal: string | null;
  limpio: boolean;
}

/** Orden: tamaño, tipo, antivirus. Lo que decide es el tipo real, no el declarado. */
export function evaluarAnalisis(
  categoria: CategoriaArchivo,
  version: Pick<VersionArchivo, 'bytesDeclarados'>,
  hallazgos: HallazgosAnalisis,
): ResultadoAnalisis {
  if (hallazgos.bytes !== version.bytesDeclarados) return 'TAMANO_NO_COINCIDE';
  if (hallazgos.mimeReal === null || !categoria.admiteMime(hallazgos.mimeReal)) return 'TIPO_NO_PERMITIDO';
  if (!hallazgos.limpio) return 'INFECTADO';
  return 'APROBADO';
}
