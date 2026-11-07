import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { Catalogo } from '../domain/catalogo.js';
import { CatalogoNoExisteError, ItemNoEncontradoError, ItemReferenciadoError } from '../domain/errores.js';
import { eventoCatalogoActualizado, type CambioCatalogo } from '../domain/eventos.js';
import type { ItemCatalogo } from '../domain/item-catalogo.js';
import type { LecturaItems, RepositorioAjustes, RepositorioCatalogos, RepositorioItems } from './ports/repositorios.js';
import type { VerificadorOperador } from './ports/verificador-operador.js';
import type { VerificadorReferencias } from './ports/verificador-referencias.js';

/** Un cambio global no toca la versión de ningún tenant. */
const SIN_VERSION_TENANT = 0;

type CambioGlobal = Exclude<CambioCatalogo, 'AJUSTE'>;

/** Lo que comparten los casos de uso de escritura de catálogos e ítems. */
export interface DependenciasCatalogos {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  reloj: Clock;
  eventos: EventPublisher;
  catalogos: RepositorioCatalogos;
  items: RepositorioItems;
  ajustes: RepositorioAjustes;
  lectura: LecturaItems;
  verificadorOperador: VerificadorOperador;
  verificadoresReferencias: readonly VerificadorReferencias[];
}

/** Antes de cualquier lectura: fuera del operador, 403 sin tocar nada (TR-RN-009). */
export function exigirOperador(dependencias: DependenciasCatalogos): Promise<void> {
  return dependencias.verificadorOperador.exigir(dependencias.contexto.current().tenantId);
}

export async function buscarCatalogo(catalogos: RepositorioCatalogos, codigo: string): Promise<Catalogo> {
  const catalogo = await catalogos.buscarPorCodigo(codigo);
  if (!catalogo) throw new CatalogoNoExisteError();
  return catalogo;
}

/** Un id de otro catálogo, global en vez de propio o al revés, o de otro tenant: 404. */
export async function buscarItemDe(
  items: RepositorioItems,
  catalogo: Catalogo,
  itemId: string,
  dueno: 'GLOBAL' | 'PROPIO',
): Promise<ItemCatalogo> {
  const item = await items.buscar(itemId);
  if (!item || item.esGlobal !== (dueno === 'GLOBAL') || item.catalogoId !== catalogo.id) throw new ItemNoEncontradoError();
  return item;
}

/** `catalogo.actualizado` de un cambio global, con la versión global que quedó tras escribir. */
export function publicarCambioGlobal(
  dependencias: DependenciasCatalogos,
  cambio: { catalogo: Catalogo; versionGlobal: number; cambio: CambioGlobal; itemId: string | null; actorId: string; ahora: Date },
): Promise<void> {
  return dependencias.eventos.publish(
    eventoCatalogoActualizado({
      catalogoId: cambio.catalogo.id,
      codigo: cambio.catalogo.codigo,
      versionGlobal: cambio.versionGlobal,
      versionTenant: SIN_VERSION_TENANT,
      tenantId: null,
      cambio: cambio.cambio,
      itemId: cambio.itemId,
      por: cambio.actorId,
      ahora: cambio.ahora,
    }),
  );
}

/**
 * `catalogo.actualizado` tras escribir un ítem global. La versión global la subió el trigger: se relee
 * dentro de la misma transacción.
 */
export async function publicarCambioDeItemGlobal(
  dependencias: DependenciasCatalogos,
  cambio: { codigoCatalogo: string; itemId: string; actorId: string; ahora: Date },
): Promise<void> {
  const catalogo = await buscarCatalogo(dependencias.catalogos, cambio.codigoCatalogo);
  await publicarCambioGlobal(dependencias, {
    catalogo,
    versionGlobal: catalogo.version,
    cambio: 'ITEM',
    itemId: cambio.itemId,
    actorId: cambio.actorId,
    ahora: cambio.ahora,
  });
}

/**
 * `catalogo.actualizado` tras escribir un ítem propio o un ajuste, con el tenant del contexto. Las versiones
 * las subieron los triggers: se releen con `cat.versiones` dentro de la misma transacción.
 */
export async function publicarCambioDelTenant(
  dependencias: DependenciasCatalogos,
  cambio: { codigoCatalogo: string; cambio: Exclude<CambioCatalogo, 'CATALOGO'>; itemId: string; actorId: string; ahora: Date },
): Promise<void> {
  const tenantId = dependencias.contexto.current().tenantId;
  const versiones = await dependencias.lectura.versiones(cambio.codigoCatalogo, tenantId);
  if (!versiones) throw new CatalogoNoExisteError();
  await dependencias.eventos.publish(
    eventoCatalogoActualizado({
      catalogoId: versiones.catalogoId,
      codigo: cambio.codigoCatalogo,
      versionGlobal: versiones.versionGlobal,
      versionTenant: versiones.versionTenant,
      tenantId,
      cambio: cambio.cambio,
      itemId: cambio.itemId,
      por: cambio.actorId,
      ahora: cambio.ahora,
    }),
  );
}

/** TR-CA-061: si algún producto lo referencia, no se borra; la alternativa es cerrar su vigencia. */
export async function exigirSinReferencias(
  verificadores: readonly VerificadorReferencias[],
  catalogo: Catalogo,
  item: ItemCatalogo,
): Promise<void> {
  const referencia = { itemId: item.id, catalogo: catalogo.codigo, codigo: item.codigo };
  for (const verificador of verificadores) {
    if (await verificador.estaReferenciado(referencia)) throw new ItemReferenciadoError();
  }
}
