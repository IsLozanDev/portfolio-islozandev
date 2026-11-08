import { buscarCatalogo, exigirOperador } from '../dependencias-catalogos.js';
import type { ImportacionListada, Listado, Pagina } from '../ports/importacion.js';
import { seguimientoDe } from './avance.js';
import type { DependenciasImportacion } from './dependencias-importacion.js';
import type { ImportacionActiva } from './resultados-importacion.js';

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

  /** Las EN_COLA que lanzó el usuario, con el avance de Redis: las que el front sigue por SSE. */
  async activas(comando: { actorId: string }): Promise<ImportacionActiva[]> {
    const { unidadDeTrabajo, importaciones, canal } = this.dependencias;
    const enCola = await unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      return importaciones.activasDe(comando.actorId);
    });
    return Promise.all(enCola.map(async (listada) => ({ ...listada, ...(await seguimientoDe(canal, listada.id, listada.estado)) })));
  }
}
