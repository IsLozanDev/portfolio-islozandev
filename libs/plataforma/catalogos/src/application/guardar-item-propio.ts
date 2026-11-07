import { CodigoItemDuplicadoError, VersionObsoletaError } from '../domain/errores.js';
import { ItemCatalogo, VERSION_INICIAL_ITEM } from '../domain/item-catalogo.js';
import { contenidoDe, type ContenidoItemComando } from './contenido-item.js';
import { buscarCatalogo, buscarItemDe, publicarCambioDelTenant, type DependenciasCatalogos } from './dependencias-catalogos.js';
import { itemGuardadoDe, type Actualizado, type ItemGuardado } from './resultados.js';

export interface CrearItemPropioComando extends ContenidoItemComando {
  catalogo: string;
  codigo: string;
  actorId: string;
}

export interface ActualizarItemPropioComando extends ContenidoItemComando {
  catalogo: string;
  itemId: string;
  /** Versión con la que se leyó (bloqueo optimista). */
  version: number;
  actorId: string;
}

/**
 * TR-RF-026: ítems propios del tenant en catálogos MIXTO o TENANT, sin cambios de código (TR-RNF-027).
 * El tenant sale del contexto, nunca del cuerpo. Cada cambio sube solo la versión de ese tenant.
 */
export class GuardarItemPropio {
  constructor(private readonly dependencias: DependenciasCatalogos) {}

  crear(comando: CrearItemPropioComando): Promise<ItemGuardado> {
    const { unidadDeTrabajo, contexto, ids, reloj, catalogos, items } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const catalogo = await buscarCatalogo(catalogos, comando.catalogo);
      const tenantId = contexto.current().tenantId;
      const ahora = reloj.now();
      const item = ItemCatalogo.crear({
        id: ids.next(),
        catalogo,
        tenantId,
        codigo: comando.codigo,
        ...contenidoDe(comando),
        por: comando.actorId,
        ahora,
      });
      // TR-CA-069: un propio no repite un global ni otro propio del tenant.
      if (await items.existeCodigo(catalogo.id, tenantId, item.codigo)) throw new CodigoItemDuplicadoError();

      await items.guardarPropio(item, null);
      await publicarCambioDelTenant(this.dependencias, {
        codigoCatalogo: catalogo.codigo,
        cambio: 'ITEM',
        itemId: item.id,
        actorId: comando.actorId,
        ahora,
      });
      return itemGuardadoDe(item, VERSION_INICIAL_ITEM);
    });
  }

  actualizar(comando: ActualizarItemPropioComando): Promise<Actualizado<ItemGuardado>> {
    const { unidadDeTrabajo, reloj, catalogos, items } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const catalogo = await buscarCatalogo(catalogos, comando.catalogo);
      const item = await buscarItemDe(items, catalogo, comando.itemId, 'PROPIO');
      if (item.version !== comando.version) throw new VersionObsoletaError();

      const ahora = reloj.now();
      const cambiado = item.actualizar({ ...contenidoDe(comando), por: comando.actorId, ahora });
      if (!cambiado) return { ...itemGuardadoDe(item, item.version), cambiado };

      if (!(await items.guardarPropio(item, comando.version))) throw new VersionObsoletaError();
      await publicarCambioDelTenant(this.dependencias, {
        codigoCatalogo: catalogo.codigo,
        cambio: 'ITEM',
        itemId: item.id,
        actorId: comando.actorId,
        ahora,
      });
      return { ...itemGuardadoDe(item, comando.version + 1), cambiado };
    });
  }
}
