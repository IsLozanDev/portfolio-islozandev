import { buscarCatalogo, buscarItemDe, exigirOperador, type DependenciasCatalogos } from './dependencias-catalogos.js';
import { itemGuardadoDe, type ItemGuardado } from './resultados.js';

export interface ObtenerItemGlobalConsulta {
  catalogo: string;
  itemId: string;
}

type DependenciasObtenerItemGlobal = Pick<DependenciasCatalogos, 'unidadDeTrabajo' | 'contexto' | 'verificadorOperador' | 'catalogos' | 'items'>;

/** Un ítem global con su versión, para editarlo. Solo el operador, como las escrituras de globales. */
export class ObtenerItemGlobal {
  constructor(private readonly dependencias: DependenciasObtenerItemGlobal) {}

  ejecutar(consulta: ObtenerItemGlobalConsulta): Promise<ItemGuardado> {
    const { unidadDeTrabajo, catalogos, items } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const catalogo = await buscarCatalogo(catalogos, consulta.catalogo);
      const item = await buscarItemDe(items, catalogo, consulta.itemId, 'GLOBAL');
      return itemGuardadoDe(item, item.version);
    });
  }
}
