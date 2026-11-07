import type { Clock, EventPublisher, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { eventoCatalogoActualizado, eventoImportacionAplicada } from '../../domain/eventos.js';
import type { Importacion } from '../../domain/importacion/importacion.js';
import { TAMANO_LOTE } from '../../domain/importacion/tipos.js';
import type { CanalAvance, EscrituraImportacion, RepositorioImportaciones, TipoLote, TrabajoImportacion } from '../ports/importacion.js';
import type { RepositorioCatalogos } from '../ports/repositorios.js';
import { porcentajeDeAvance, publicarAviso, resumenDeAviso, type Avisar } from './avance.js';
import { buscarImportacion, codigoDeCatalogo } from './dependencias-importacion.js';

const SIN_VERSION_TENANT = 0;
const MOTIVO_OBSOLETA = 'El catálogo cambió desde la previsualización; vuelva a previsualizar';

export interface DependenciasProcesarImportacion {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  catalogos: Pick<RepositorioCatalogos, 'buscarPorId'>;
  importaciones: RepositorioImportaciones;
  escritura: EscrituraImportacion;
  eventos: EventPublisher;
  canal: CanalAvance;
  avisar: Avisar;
}

type Resultado = { tipo: 'NADA' } | { tipo: 'OBSOLETA' } | { tipo: 'APLICADA'; importacion: Importacion };

/**
 * Worker: aplica una importación EN_COLA en una sola transacción (todo o nada) y escribe sus eventos en
 * el outbox dentro de ella. Un fallo de datos queda FALLIDA y no se reintenta: el operador corrige y
 * vuelve a previsualizar. Si el worker muere a mitad, PostgreSQL deshace todo y el reintento de BullMQ
 * llega aquí de nuevo con la fila aún EN_COLA.
 */
export class ProcesarImportacion {
  constructor(private readonly dependencias: DependenciasProcesarImportacion) {}

  ejecutar(trabajo: TrabajoImportacion): Promise<void> {
    return this.dependencias.contexto.run({ tenantId: trabajo.tenantId }, async () => {
      let resultado: Resultado;
      try {
        resultado = await this.dependencias.unidadDeTrabajo.run(() => this.aplicar(trabajo));
      } catch (error) {
        await this.terminarFallida(trabajo.importacionId, error as Error);
        return;
      }
      await this.informarResultado(trabajo.importacionId, resultado);
    });
  }

  private async aplicar(trabajo: TrabajoImportacion): Promise<Resultado> {
    const { importaciones, escritura } = this.dependencias;
    const importacion = await buscarImportacion(importaciones, trabajo.importacionId);
    if (importacion.esFinal) return { tipo: 'NADA' };
    if (!(await escritura.iniciar(importacion.id))) return this.motivoDelRechazo(importacion.id);

    await this.avisarAvance(importacion.id, 0);
    await this.aplicarOperaciones(importacion);
    const por = importacion.aplicadoPor ?? trabajo.usuarioId;
    const versionGlobal = await escritura.finalizar(importacion.id, por);
    await this.publicarEventos(importacion, versionGlobal, por);
    return { tipo: 'APLICADA', importacion };
  }

  /** iniciar da false con la fila bloqueada: releída, o ya terminó (reintento) o el catálogo cambió. */
  private async motivoDelRechazo(importacionId: string): Promise<Resultado> {
    const releida = await buscarImportacion(this.dependencias.importaciones, importacionId);
    return releida.esFinal ? { tipo: 'NADA' } : { tipo: 'OBSOLETA' };
  }

  private async aplicarOperaciones(importacion: Importacion): Promise<void> {
    const { altas, cambios, bajas } = importacion.resumen;
    const total = altas + cambios + bajas;
    const hechas = await this.aplicarEnLotes(importacion.id, 'ALTA', altas, 0, total);
    const conCambios = await this.aplicarEnLotes(importacion.id, 'CAMBIO', cambios, hechas, total);
    await this.dependencias.escritura.cerrarBajas(importacion.id);
    await this.avisarAvance(importacion.id, porcentajeDeAvance(conCambios + bajas, total));
  }

  /** Devuelve las operaciones hechas hasta ahora, contando las previas. */
  private async aplicarEnLotes(importacionId: string, tipo: TipoLote, cantidad: number, previas: number, total: number): Promise<number> {
    for (let desde = 0; desde < cantidad; desde += TAMANO_LOTE) {
      const hasta = Math.min(desde + TAMANO_LOTE, cantidad);
      await this.dependencias.escritura.aplicarLote(importacionId, tipo, desde, hasta);
      await this.avisarAvance(importacionId, porcentajeDeAvance(previas + hasta, total));
    }
    return previas + cantidad;
  }

  private async publicarEventos(importacion: Importacion, versionGlobal: number, por: string): Promise<void> {
    const { catalogos, eventos, reloj } = this.dependencias;
    const codigo = await codigoDeCatalogo(catalogos, importacion.catalogoId);
    const ahora = reloj.now();
    await eventos.publish(
      eventoCatalogoActualizado({
        catalogoId: importacion.catalogoId,
        codigo,
        versionGlobal,
        versionTenant: SIN_VERSION_TENANT,
        tenantId: null,
        cambio: 'IMPORTACION',
        itemId: null,
        por,
        ahora,
      }),
    );
    await eventos.publish(
      eventoImportacionAplicada({
        importacionId: importacion.id,
        catalogoId: importacion.catalogoId,
        codigo,
        versionOficial: importacion.versionOficial,
        fechaVigencia: importacion.fechaVigencia,
        archivoSha256: importacion.archivoSha256,
        altas: importacion.resumen.altas,
        cambios: importacion.resumen.cambios,
        bajas: importacion.resumen.bajas,
        versionGlobal,
        por,
        ahora,
      }),
    );
  }

  /** Después del commit: el `fin` APLICADA, o marcar OBSOLETA en otra transacción. */
  private async informarResultado(importacionId: string, resultado: Resultado): Promise<void> {
    const { canal, avisar } = this.dependencias;
    if (resultado.tipo === 'APLICADA') {
      const resumen = resumenDeAviso(resultado.importacion.resumen);
      await publicarAviso(canal, avisar, importacionId, { tipo: 'fin', estado: 'APLICADA', resumen, motivo: null });
    }
    if (resultado.tipo === 'OBSOLETA') {
      const terminada = await this.terminarEnOtraTransaccion(importacionId, (importacion, ahora) => importacion.marcarObsoleta(ahora));
      if (terminada.estado !== 'OBSOLETA') return;
      await publicarAviso(canal, avisar, importacionId, { tipo: 'fin', estado: 'OBSOLETA', resumen: null, motivo: MOTIVO_OBSOLETA });
    }
  }

  /** El rollback ya dejó el catálogo como estaba. Las tablas oficiales no traen datos personales. */
  private async terminarFallida(importacionId: string, error: Error): Promise<void> {
    const { canal, avisar } = this.dependencias;
    avisar('Falló la aplicación de una importación', { evento: 'cat.importacion.fallida', importacionId, error: error.name });
    const terminada = await this.terminarEnOtraTransaccion(importacionId, (importacion, ahora) =>
      importacion.marcarFallida(`No se pudo aplicar la importación: ${error.message}`, ahora),
    );
    if (terminada.estado !== 'FALLIDA') return;
    await publicarAviso(canal, avisar, importacionId, { tipo: 'fin', estado: 'FALLIDA', resumen: null, motivo: terminada.motivoFallo });
  }

  /** Devuelve la importación como quedó; si ya no estaba EN_COLA (devuelta a PREVISUALIZADA o terminada), no la toca. */
  private terminarEnOtraTransaccion(importacionId: string, terminar: (importacion: Importacion, ahora: Date) => void): Promise<Importacion> {
    const { unidadDeTrabajo, importaciones, reloj } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const importacion = await buscarImportacion(importaciones, importacionId);
      if (importacion.estado !== 'EN_COLA') return importacion;
      terminar(importacion, reloj.now());
      await importaciones.guardar(importacion, importacion.version);
      return importacion;
    });
  }

  private avisarAvance(importacionId: string, avance: number): Promise<void> {
    const { canal, avisar } = this.dependencias;
    return publicarAviso(canal, avisar, importacionId, { tipo: 'avance', estado: 'EN_PROCESO', avance });
  }
}
