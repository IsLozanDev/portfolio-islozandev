import type { ResumenImportacion } from '../../domain/importacion/importacion.js';
import type { EstadoImportacion, EstadoSeguimiento } from '../../domain/importacion/tipos.js';
import type { AvisoImportacion, CanalAvance, ResumenAviso } from '../ports/importacion.js';

export const EVENTO_ERROR_AVANCE = 'cat.importacion.avance_error';
/** El 100 llega solo con el `fin`, después del commit. */
const AVANCE_ANTES_DEL_COMMIT = 99;
export const MOTIVO_OBSOLETA = 'El catálogo cambió desde la previsualización; vuelva a previsualizar';
export const AVISO_EN_COLA: AvisoImportacion = { tipo: 'avance', estado: 'EN_COLA', avance: 0 };

export type Avisar = (mensaje: string, datos: Record<string, unknown>) => void;

export function porcentajeDeAvance(hechas: number, total: number): number {
  if (total === 0) return AVANCE_ANTES_DEL_COMMIT;
  return Math.round((hechas / total) * AVANCE_ANTES_DEL_COMMIT);
}

export function resumenDeAviso(resumen: ResumenImportacion): ResumenAviso {
  return { altas: resumen.altas, cambios: resumen.cambios, bajas: resumen.bajas, sin_cambios: resumen.sinCambios };
}

export interface Seguimiento {
  estado: EstadoSeguimiento;
  /** Solo mientras está EN_COLA: 0-99 desde Redis; null en los demás estados o si Redis no responde. */
  avance: number | null;
}

/** La base sigue en EN_COLA mientras el worker aplica: Redis dice si ya está EN_PROCESO y cuánto lleva. */
export async function seguimientoDe(canal: CanalAvance, importacionId: string, estadoBase: EstadoImportacion): Promise<Seguimiento> {
  if (estadoBase !== 'EN_COLA') return { estado: estadoBase, avance: null };
  try {
    const aviso = await canal.ultimo(importacionId);
    if (aviso?.tipo !== 'avance') return { estado: estadoBase, avance: null };
    return { estado: aviso.estado, avance: aviso.avance };
  } catch {
    return { estado: estadoBase, avance: null };
  }
}

/** El avance es informativo: si Redis falla se registra y el trabajo sigue. Solo el nombre del error (TR-RNF-026). */
export async function publicarAviso(canal: CanalAvance, avisar: Avisar, importacionId: string, aviso: AvisoImportacion): Promise<void> {
  try {
    await canal.publicar(importacionId, aviso);
  } catch (error) {
    avisar('No se pudo publicar el avance de la importación', { evento: EVENTO_ERROR_AVANCE, importacionId, error: (error as Error).name });
  }
}
