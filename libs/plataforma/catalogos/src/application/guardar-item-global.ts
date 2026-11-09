import { CodigoItemDuplicadoError, VersionObsoletaError } from '../domain/errores.js';
import { ItemCatalogo, VERSION_INICIAL_ITEM } from '../domain/item-catalogo.js';
import { contenidoDe, type ContenidoItemComando } from './contenido-item.js';
import {
  buscarCatalogo,
  buscarItemDe,
  exigirEdicionManualDeGlobales,
  exigirOperador,
  publicarCambioDeItemGlobal,
  type DependenciasCatalogos,
} from './dependencias-catalogos.js';
import { itemGuardadoDe, type Actualizado, type ItemGuardado } from './resultados.js';

export interface CrearItemGlobalComando extends ContenidoItemComando {
  catalogo: string;
  codigo: string;
  actorId: string;
}

export interface ActualizarItemGlobalComando extends ContenidoItemComando {
  catalogo: string;
  itemId: string;
  /** Versión con la que se leyó (bloqueo optimista). */
  version: number;
  actorId: string;
}

/**
 * TR-RF-023: crea o actualiza un ítem global de un catálogo GLOBAL o MIXTO. Cerrar la vigencia e inactivar
 * van por `actualizar`. Solo el operador; cada cambio sube la versión global y cambia el ETag de todos.
 */
export class GuardarItemGlobal {
  constructor(private readonly dependencias: DependenciasCatalogos) {}

  crear(comando: CrearItemGlobalComando): Promise<ItemGuardado> {
    const { unidadDeTrabajo, ids, reloj, catalogos, items } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const catalogo = await buscarCatalogo(catalogos, comando.catalogo);
      exigirEdicionManualDeGlobales(catalogo);
      const ahora = reloj.now();
      const item = ItemCatalogo.crear({
        id: ids.next(),
        catalogo,
        tenantId: null,
        codigo: comando.codigo,
        ...contenidoDe(comando),
        por: comando.actorId,
        ahora,
      });
      if (await items.existeCodigo(catalogo.id, null, item.codigo)) throw new CodigoItemDuplicadoError();

      await items.guardarGlobal(item, null);
      await publicarCambioDeItemGlobal(this.dependencias, { codigoCatalogo: catalogo.codigo, itemId: item.id, actorId: comando.actorId, ahora });
      return itemGuardadoDe(item, VERSION_INICIAL_ITEM);
    });
  }

  actualizar(comando: ActualizarItemGlobalComando): Promise<Actualizado<ItemGuardado>> {
    const { unidadDeTrabajo, reloj, catalogos, items } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const catalogo = await buscarCatalogo(catalogos, comando.catalogo);
      exigirEdicionManualDeGlobales(catalogo);
      const item = await buscarItemDe(items, catalogo, comando.itemId, 'GLOBAL');
      if (item.version !== comando.version) throw new VersionObsoletaError();

      const ahora = reloj.now();
      const cambiado = item.actualizar({ ...contenidoDe(comando), por: comando.actorId, ahora });
      if (!cambiado) return { ...itemGuardadoDe(item, item.version), cambiado };

      if (!(await items.guardarGlobal(item, comando.version))) throw new VersionObsoletaError();
      await publicarCambioDeItemGlobal(this.dependencias, { codigoCatalogo: catalogo.codigo, itemId: item.id, actorId: comando.actorId, ahora });
      return { ...itemGuardadoDe(item, comando.version + 1), cambiado };
    });
  }
}
