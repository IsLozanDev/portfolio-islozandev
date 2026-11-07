import type { ResumenImportacion } from '../../domain/importacion/importacion.js';
import type { AvisoImportacion, CanalAvance, ResumenAviso } from '../ports/importacion.js';

export const EVENTO_ERROR_AVANCE = 'cat.importacion.avance_error';
/** El 100 llega solo con el `fin`, después del commit. */
const AVANCE_ANTES_DEL_COMMIT = 99;

export type Avisar = (mensaje: string, datos: Record<string, unknown>) => void;

export function porcentajeDeAvance(hechas: number, total: number): number {
  if (total === 0) return AVANCE_ANTES_DEL_COMMIT;
  return Math.round((hechas / total) * AVANCE_ANTES_DEL_COMMIT);
}

export function resumenDeAviso(resumen: ResumenImportacion): ResumenAviso {
  return { altas: resumen.altas, cambios: resumen.cambios, bajas: resumen.bajas, sin_cambios: resumen.sinCambios };
}

/** El avance es informativo: si Redis falla se registra y el trabajo sigue. Solo el nombre del error (TR-RNF-026). */
export async function publicarAviso(canal: CanalAvance, avisar: Avisar, importacionId: string, aviso: AvisoImportacion): Promise<void> {
  try {
    await canal.publicar(importacionId, aviso);
  } catch (error) {
    avisar('No se pudo publicar el avance de la importación', { evento: EVENTO_ERROR_AVANCE, importacionId, error: (error as Error).name });
  }
}
