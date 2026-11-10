import { camposCambiados } from '../domain/cambios.js';
import { AuditoriaNoDisponibleError, ExportacionDemasiadoGrandeError } from '../domain/errores.js';
import { MAXIMO_FILAS_EXPORTACION, validarFiltroAuditoria, type FiltroAuditoria } from '../domain/filtro-auditoria.js';
import { PERMISOS_AUD } from '../domain/permisos-aud.js';
import { nombresDe, resolverFiltro } from './alcance-auditoria.js';
import { conNombres, type DependenciasConsultaAuditoria } from './consultar-auditoria.js';
import type { AuditoriaPort } from './ports/auditoria.port.js';
import type { EscritorAuditoria } from './ports/escritor-auditoria.port.js';
import type { EventoAuditoriaCompleto } from './ports/lectura-auditoria.port.js';

export interface DependenciasExportacionAuditoria extends DependenciasConsultaAuditoria {
  auditoria: AuditoriaPort;
  /** Log estructurado: solo el nombre del error, nunca los filtros (TR-RNF-026). */
  avisar: (mensaje: string, datos: Record<string, unknown>) => void;
}

const ENTIDAD_EXPORTADA = { entidadTipo: 'auditoria', entidadId: 'exportacion' } as const;

/**
 * Exportación XLSX al vuelo de la auditoría con el alcance del actor (spec 20b, TR-RN-047). La fila
 * plat.auditoria.exportar queda escrita en su propia transacción antes del primer byte: si no se puede
 * escribir, no se exporta (falla cerrado, TR-RNF-013).
 */
export class ExportarAuditoria {
  constructor(private readonly dependencias: DependenciasExportacionAuditoria) {}

  async ejecutar(filtro: FiltroAuditoria, escritor: EscritorAuditoria): Promise<void> {
    const filtroValido = validarFiltroAuditoria(filtro);
    const { unidadDeTrabajo, lectura } = this.dependencias;

    const { resuelto, filas } = await unidadDeTrabajo.run(async () => {
      const filtroResuelto = await resolverFiltro(this.dependencias, filtroValido, PERMISOS_AUD.exportar);
      return { resuelto: filtroResuelto, filas: filtroResuelto ? await lectura.contar(filtroResuelto) : 0 };
    });
    if (filas > MAXIMO_FILAS_EXPORTACION) throw new ExportacionDemasiadoGrandeError(filas, MAXIMO_FILAS_EXPORTACION);
    await this.auditar(filtroValido, filas);

    escritor.abrir();
    if (resuelto) await unidadDeTrabajo.run(() => lectura.recorrer(resuelto, (eventos) => this.escribirLote(eventos, escritor)));
    await escritor.terminar();
  }

  /** El texto de `usuario` va tal cual en los filtros: es el criterio de la exportación. Nunca a logs. */
  private async auditar(filtro: FiltroAuditoria, filas: number): Promise<void> {
    const { unidadDeTrabajo, auditoria, avisar } = this.dependencias;
    const filtros = Object.fromEntries(Object.entries(filtro).filter(([, valor]) => valor !== undefined));
    try {
      await unidadDeTrabajo.run(() => auditoria.registrar({ accion: PERMISOS_AUD.exportar, ...ENTIDAD_EXPORTADA, despues: { filtros, filas } }));
    } catch (error) {
      avisar('aud.exportacion.auditoria_error', { error: error instanceof Error ? error.name : typeof error });
      throw new AuditoriaNoDisponibleError();
    }
  }

  private async escribirLote(eventos: readonly EventoAuditoriaCompleto[], escritor: EscritorAuditoria): Promise<void> {
    const nombres = await nombresDe(this.dependencias.directorio, eventos);
    await escritor.escribir(eventos.map((evento) => ({ ...conNombres(evento, nombres), camposCambiados: camposCambiados(evento.antes, evento.despues) })));
  }
}
