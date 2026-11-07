import { VersionObsoletaError } from '../domain/errores.js';
import {
  buscarCatalogo,
  buscarItemDe,
  exigirSinReferencias,
  publicarCambioDelTenant,
  type DependenciasCatalogos,
} from './dependencias-catalogos.js';

export interface EliminarItemPropioComando {
  catalogo: string;
  itemId: string;
  version: number;
  actorId: string;
}

/** Borrado físico de un ítem propio del tenant, con la misma regla de referencias que los globales (TR-CA-061). */
export class EliminarItemPropio {
  constructor(private readonly dependencias: DependenciasCatalogos) {}

  ejecutar(comando: EliminarItemPropioComando): Promise<void> {
    const { unidadDeTrabajo, reloj, catalogos, items, verificadoresReferencias } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const catalogo = await buscarCatalogo(catalogos, comando.catalogo);
      const item = await buscarItemDe(items, catalogo, comando.itemId, 'PROPIO');
      if (item.version !== comando.version) throw new VersionObsoletaError();
      await exigirSinReferencias(verificadoresReferencias, catalogo, item);

      if (!(await items.eliminarPropio(item.id, comando.version))) throw new VersionObsoletaError();
      await publicarCambioDelTenant(this.dependencias, {
        codigoCatalogo: catalogo.codigo,
        cambio: 'ITEM',
        itemId: item.id,
        actorId: comando.actorId,
        ahora: reloj.now(),
      });
    });
  }
}
