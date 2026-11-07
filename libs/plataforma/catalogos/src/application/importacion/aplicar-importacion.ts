import { VersionObsoletaError } from '../../domain/errores.js';
import { ColaNoDisponibleError, ImportacionNoAplicableError } from '../../domain/importacion/errores.js';
import type { Importacion } from '../../domain/importacion/importacion.js';
import { exigirOperador } from '../dependencias-catalogos.js';
import { publicarAviso } from './avance.js';
import { buscarImportacion, type DependenciasImportacion } from './dependencias-importacion.js';

export interface AplicarImportacionComando {
  id: string;
  /** Versión con la que se leyó (bloqueo optimista). */
  version: number;
  actorId: string;
}

export interface ImportacionEncolada {
  id: string;
  estado: 'EN_COLA';
}

/**
 * TR-RF-028: aprueba una previsualización y la deja EN_COLA para el worker; no escribe ítems (202). Si la
 * cola no acepta el trabajo, vuelve a PREVISUALIZADA y responde 503.
 */
export class AplicarImportacion {
  constructor(private readonly dependencias: DependenciasImportacion) {}

  async ejecutar(comando: AplicarImportacionComando): Promise<ImportacionEncolada> {
    const importacion = await this.encolarEnBase(comando);
    const { cola, canal, avisar, contexto } = this.dependencias;
    try {
      await cola.encolar({ importacionId: importacion.id, tenantId: contexto.current().tenantId, usuarioId: comando.actorId });
    } catch {
      await this.devolverAPrevisualizada(importacion.id);
      throw new ColaNoDisponibleError();
    }
    await publicarAviso(canal, avisar, importacion.id, { tipo: 'avance', estado: 'EN_COLA', avance: 0 });
    return { id: importacion.id, estado: 'EN_COLA' };
  }

  /** La VENCIDA se guarda antes de responder 409: el error sale después del commit. */
  private async encolarEnBase(comando: AplicarImportacionComando): Promise<Importacion> {
    const { unidadDeTrabajo, reloj, importaciones } = this.dependencias;
    const { importacion, encolada } = await unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const leida = await buscarImportacion(importaciones, comando.id);
      if (leida.version !== comando.version) throw new VersionObsoletaError();
      const ahora = reloj.now();
      await this.liberarTrabajoPerdido(leida.catalogoId, ahora);
      const encolada = leida.encolar(comando.actorId, ahora);
      if (!(await importaciones.guardar(leida, comando.version))) throw new VersionObsoletaError();
      return { importacion: leida, encolada };
    });
    if (!encolada) throw new ImportacionNoAplicableError(importacion.estado);
    return importacion;
  }

  /** Otra EN_COLA del catálogo cuyo trabajo se perdió en Redis queda FALLIDA y libera ux_importacion_activa. */
  private async liberarTrabajoPerdido(catalogoId: string, ahora: Date): Promise<void> {
    const { importaciones } = this.dependencias;
    const enCola = await importaciones.enColaDe(catalogoId);
    if (enCola?.revisarPerdida(ahora)) await importaciones.guardar(enCola, enCola.version);
  }

  private devolverAPrevisualizada(id: string): Promise<void> {
    const { unidadDeTrabajo, importaciones } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const importacion = await buscarImportacion(importaciones, id);
      importacion.devolverAPrevisualizada();
      await importaciones.guardar(importacion, importacion.version);
    });
  }
}
