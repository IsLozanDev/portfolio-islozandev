import { buscarCatalogo, exigirOperador } from '../dependencias-catalogos.js';
import type { ImportacionListada, Listado, Pagina } from '../ports/importacion.js';
import type { DependenciasImportacion } from './dependencias-importacion.js';

export const TAMANO_PAGINA_MAXIMO = 50;

/** Historial de un catálogo, con las RECHAZADA y su total de errores. Lo ve cualquier operador con el permiso. */
export class ListarImportaciones {
  constructor(private readonly dependencias: DependenciasImportacion) {}

  historial(comando: { catalogo: string } & Pagina): Promise<Listado<ImportacionListada>> {
    const { unidadDeTrabajo, catalogos, importaciones } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const catalogo = await buscarCatalogo(catalogos, comando.catalogo);
      return importaciones.listarPorCatalogo(catalogo.id, { pagina: comando.pagina, tamano: Math.min(comando.tamano, TAMANO_PAGINA_MAXIMO) });
    });
  }

  /** Las EN_COLA que lanzó el usuario: las que el front sigue por SSE. */
  activas(comando: { actorId: string }): Promise<ImportacionListada[]> {
    const { unidadDeTrabajo, importaciones } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      return importaciones.activasDe(comando.actorId);
    });
  }
}
