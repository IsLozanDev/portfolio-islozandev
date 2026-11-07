import { VersionObsoletaError } from '../domain/errores.js';
import {
  buscarCatalogo,
  buscarItemDe,
  exigirOperador,
  exigirSinReferencias,
  publicarCambioDeItemGlobal,
  type DependenciasCatalogos,
} from './dependencias-catalogos.js';

export interface EliminarItemGlobalComando {
  catalogo: string;
  itemId: string;
  version: number;
  actorId: string;
}

/**
 * Borrado físico de un ítem global y sus ajustes, solo si ningún producto lo referencia (TR-CA-061).
 * Si lo referencian, 409 ITEM_REFERENCIADO: la alternativa es cerrar su vigencia o inactivarlo.
 */
export class EliminarItemGlobal {
  constructor(private readonly dependencias: DependenciasCatalogos) {}

  ejecutar(comando: EliminarItemGlobalComando): Promise<void> {
    const { unidadDeTrabajo, reloj, catalogos, items, verificadoresReferencias } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const catalogo = await buscarCatalogo(catalogos, comando.catalogo);
      const item = await buscarItemDe(items, catalogo, comando.itemId, 'GLOBAL');
      if (item.version !== comando.version) throw new VersionObsoletaError();
      await exigirSinReferencias(verificadoresReferencias, catalogo, item);

      if (!(await items.eliminarGlobal(item.id, comando.version))) throw new VersionObsoletaError();
      await publicarCambioDeItemGlobal(this.dependencias, {
        codigoCatalogo: catalogo.codigo,
        itemId: item.id,
        actorId: comando.actorId,
        ahora: reloj.now(),
      });
    });
  }
}
