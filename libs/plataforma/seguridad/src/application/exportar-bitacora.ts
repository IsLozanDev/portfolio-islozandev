import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import { AuditoriaNoDisponibleError, ExportacionDemasiadoGrandeError } from '../domain/errores.js';
import { rangoValido } from './lecturas-bitacora.js';
import type { EscritorBitacora } from './ports/escritor-bitacora.port.js';
import type { FiltroExportacion, LecturaBitacora } from './ports/lectura-bitacora.js';
import type { BitacoraSeguridad, TipoEventoSeguridad } from './ports/repositorios.js';

/** Acota el archivo y el tiempo de la respuesta (TR-RNF-002); con más filas, se pide acotar. */
export const MAXIMO_FILAS_EXPORTACION = 10_000;
const RECURSO_EXPORTADO = 'bitacora';

export interface SolicitudExportacion {
  desde?: string;
  hasta?: string;
  tipo?: TipoEventoSeguridad;
  usuario?: string;
  usuarioId: string;
  ip: string | null;
}

export interface DependenciasExportacion {
  unidadDeTrabajo: UnitOfWork;
  lectura: LecturaBitacora;
  bitacora: BitacoraSeguridad;
  avisar: (mensaje: string, datos: Record<string, unknown>) => void;
}

/**
 * Exportación XLSX al vuelo de la bitácora del tenant (spec 18b, TR-RN-047). La fila EXPORTACION
 * queda escrita antes del primer byte: si no se puede escribir, no se exporta (falla cerrado).
 */
export class ExportarBitacora {
  constructor(private readonly dependencias: DependenciasExportacion) {}

  async ejecutar(solicitud: SolicitudExportacion, escritor: EscritorBitacora): Promise<void> {
    const filtro: FiltroExportacion = { ...rangoValido(solicitud.desde, solicitud.hasta), tipo: solicitud.tipo, usuario: solicitud.usuario };
    const { unidadDeTrabajo, lectura } = this.dependencias;

    const filas = await unidadDeTrabajo.run(() => lectura.contar(filtro));
    if (filas > MAXIMO_FILAS_EXPORTACION) throw new ExportacionDemasiadoGrandeError(filas, MAXIMO_FILAS_EXPORTACION);
    await this.auditar(solicitud, filtro, filas);

    escritor.abrir();
    await unidadDeTrabajo.run(() => lectura.recorrer(filtro, (eventos) => escritor.escribir(eventos)));
    await escritor.terminar();
  }

  private async auditar(solicitud: SolicitudExportacion, filtro: FiltroExportacion, filas: number): Promise<void> {
    const { unidadDeTrabajo, bitacora, avisar } = this.dependencias;
    const filtros = Object.fromEntries(Object.entries(filtro).filter(([, valor]) => valor !== undefined));
    try {
      await unidadDeTrabajo.run(() => bitacora.registrar('EXPORTACION', solicitud.usuarioId, { recurso: RECURSO_EXPORTADO, filtros, filas }, solicitud.ip));
    } catch (error) {
      avisar('seg.exportacion.auditoria_error', { error: error instanceof Error ? error.name : typeof error });
      throw new AuditoriaNoDisponibleError();
    }
  }
}
