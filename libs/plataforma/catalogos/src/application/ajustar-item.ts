import { AjusteItem } from '../domain/ajuste-item.js';
import type { Catalogo } from '../domain/catalogo.js';
import { AlcanceNoPermiteError, ItemNoEncontradoError, VersionObsoletaError } from '../domain/errores.js';
import type { ItemCatalogo } from '../domain/item-catalogo.js';
import { buscarCatalogo, publicarCambioDelTenant, type DependenciasCatalogos } from './dependencias-catalogos.js';
import type { AjusteGuardado } from './ports/repositorios.js';

export interface AjustarItemComando {
  catalogo: string;
  itemId: string;
  visible: boolean;
  orden: number | null;
  alias: string | null;
  /** Versión del ajuste con la que se leyó; null si el tenant aún no tenía ajuste. */
  version: number | null;
  actorId: string;
}

export interface AjusteAplicado {
  itemId: string;
  visible: boolean;
  orden: number | null;
  alias: string | null;
  /** null si no queda fila de ajuste (neutro). */
  version: number | null;
  /** false: ya estaba así; no se escribió ni se publicó (TR-RNF-008). */
  cambiado: boolean;
}

const VERSION_INICIAL_AJUSTE = 0;

/**
 * TR-RF-025: el tenant oculta, reordena o renombra un ítem global de un catálogo MIXTO sin tocar el global
 * ni a los demás tenants (TR-CA-066). En otro alcance o sobre un ítem propio, ALCANCE_NO_PERMITE (TR-CA-067).
 */
export class AjustarItem {
  constructor(private readonly dependencias: DependenciasCatalogos) {}

  ejecutar(comando: AjustarItemComando): Promise<AjusteAplicado> {
    const { unidadDeTrabajo, reloj, catalogos, ajustes } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const catalogo = await buscarCatalogo(catalogos, comando.catalogo);
      if (!catalogo.admiteAjustes()) throw new AlcanceNoPermiteError();
      await this.buscarItemGlobal(catalogo, comando.itemId);

      const actual = await ajustes.buscar(comando.itemId);
      if ((actual?.version ?? null) !== comando.version) throw new VersionObsoletaError();
      const nuevo = AjusteItem.de({ visible: comando.visible, orden: comando.orden, alias: comando.alias });
      if (sinCambios(actual, nuevo)) return aplicado(comando.itemId, nuevo, actual?.version ?? null, false);

      const ahora = reloj.now();
      const version = await this.escribir(comando, actual, nuevo, ahora);
      await publicarCambioDelTenant(this.dependencias, {
        codigoCatalogo: catalogo.codigo,
        cambio: 'AJUSTE',
        itemId: comando.itemId,
        actorId: comando.actorId,
        ahora,
      });
      return aplicado(comando.itemId, nuevo, version, true);
    });
  }

  /** Un id de otro catálogo o de otro tenant no existe; un propio del tenant no se ajusta. */
  private async buscarItemGlobal(catalogo: Catalogo, itemId: string): Promise<ItemCatalogo> {
    const item = await this.dependencias.items.buscar(itemId);
    if (!item || item.catalogoId !== catalogo.id) throw new ItemNoEncontradoError();
    if (!item.esGlobal) throw new AlcanceNoPermiteError();
    return item;
  }

  /** Devuelve la versión que queda, o null si el ajuste neutro borró la fila. */
  private async escribir(comando: AjustarItemComando, actual: AjusteGuardado | null, nuevo: AjusteItem, ahora: Date): Promise<number | null> {
    const { ajustes } = this.dependencias;
    if (nuevo.esNeutro()) {
      await ajustes.borrar(comando.itemId);
      return null;
    }
    const versionAnterior = actual?.version ?? null;
    const autoria = { por: comando.actorId, ahora };
    if (!(await ajustes.guardar(comando.itemId, nuevo, versionAnterior, autoria))) throw new VersionObsoletaError();
    return versionAnterior === null ? VERSION_INICIAL_AJUSTE : versionAnterior + 1;
  }
}

/** Sin fila y neutro, o igual al guardado. */
function sinCambios(actual: AjusteGuardado | null, nuevo: AjusteItem): boolean {
  return actual === null ? nuevo.esNeutro() : actual.ajuste.igualA(nuevo);
}

function aplicado(itemId: string, ajuste: AjusteItem, version: number | null, cambiado: boolean): AjusteAplicado {
  return { itemId, visible: ajuste.visible, orden: ajuste.orden, alias: ajuste.alias, version, cambiado };
}
