import { buscarCatalogo, buscarItemDe, type DependenciasCatalogos } from './dependencias-catalogos.js';
import { itemGuardadoDe, type ItemGuardado } from './resultados.js';

export interface ObtenerItemPropioConsulta {
  catalogo: string;
  itemId: string;
}

type DependenciasObtenerItemPropio = Pick<DependenciasCatalogos, 'unidadDeTrabajo' | 'catalogos' | 'items'>;

/** Un ítem propio con su versión, para editarlo (spec 19e). La RLS deja fuera los de otros tenants. */
export class ObtenerItemPropio {
  constructor(private readonly dependencias: DependenciasObtenerItemPropio) {}

  ejecutar(consulta: ObtenerItemPropioConsulta): Promise<ItemGuardado> {
    const { unidadDeTrabajo, catalogos, items } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const catalogo = await buscarCatalogo(catalogos, consulta.catalogo);
      const item = await buscarItemDe(items, catalogo, consulta.itemId, 'PROPIO');
      return itemGuardadoDe(item, item.version);
    });
  }
}
