import { fechaDeCierre, type CambioItem, type Diferencias } from '../../domain/importacion/calcular-diferencias.js';
import type { FilaImportada } from '../../domain/importacion/fila-importada.js';
import type { Importacion, ResumenImportacion } from '../../domain/importacion/importacion.js';
import type { EstadoImportacion } from '../../domain/importacion/tipos.js';
import type { ImportacionListada } from '../ports/importacion.js';
import type { Seguimiento } from './avance.js';

/** Fila de `?activas=true`: con el código del catálogo, que el seguimiento muestra, y el estado y el avance que da Redis. */
export type ImportacionActiva = Omit<ImportacionListada, 'estado'> & Seguimiento & { codigo: string };

const MUESTRA_POR_TIPO = 20;

export interface BajaEnMuestra {
  itemId: string;
  codigo: string;
  nombre: string;
  vigenteHasta: string;
}

export interface Previsualizacion {
  id: string;
  /** La que pide `aplicar` (bloqueo optimista). */
  version: number;
  estado: EstadoImportacion;
  versionOficial: string;
  fechaVigencia: string;
  archivoSha256: string;
  resumen: ResumenImportacion & { totalFilas: number };
  /** Hasta 20 de cada tipo; los cambios llevan antes y después. */
  muestra: { altas: FilaImportada[]; cambios: CambioItem[]; bajas: BajaEnMuestra[] };
  venceEn: Date;
}

export interface DetalleImportacion extends Seguimiento {
  id: string;
  codigo: string;
  versionOficial: string;
  fechaVigencia: string;
  archivoNombre: string;
  archivoSha256: string;
  resumen: ResumenImportacion;
  totalErrores: number;
  motivoFallo: string | null;
  lanzadoPor: string;
  creadoEn: Date;
  aplicadoPor: string | null;
  terminadoEn: Date | null;
  venceEn: Date;
}

export function previsualizacionDe(importacion: Importacion, diferencias: Diferencias, totalFilas: number): Previsualizacion {
  const { fechaVigencia } = importacion;
  return {
    id: importacion.id,
    version: importacion.version,
    estado: importacion.estado,
    versionOficial: importacion.versionOficial,
    fechaVigencia,
    archivoSha256: importacion.archivoSha256,
    resumen: { ...importacion.resumen, totalFilas },
    muestra: {
      altas: diferencias.altas.slice(0, MUESTRA_POR_TIPO),
      cambios: diferencias.cambios.slice(0, MUESTRA_POR_TIPO),
      bajas: diferencias.bajas.slice(0, MUESTRA_POR_TIPO).map((item) => ({
        itemId: item.id,
        codigo: item.codigo,
        nombre: item.nombre,
        vigenteHasta: fechaDeCierre(item, fechaVigencia),
      })),
    },
    venceEn: importacion.venceEn,
  };
}

export function detalleDe(importacion: Importacion, codigo: string, seguimiento: Seguimiento): DetalleImportacion {
  return {
    id: importacion.id,
    codigo,
    ...seguimiento,
    versionOficial: importacion.versionOficial,
    fechaVigencia: importacion.fechaVigencia,
    archivoNombre: importacion.archivoNombre,
    archivoSha256: importacion.archivoSha256,
    resumen: importacion.resumen,
    totalErrores: importacion.totalErrores,
    motivoFallo: importacion.motivoFallo,
    lanzadoPor: importacion.lanzadoPor,
    creadoEn: importacion.creadoEn,
    aplicadoPor: importacion.aplicadoPor,
    terminadoEn: importacion.terminadoEn,
    venceEn: importacion.venceEn,
  };
}
