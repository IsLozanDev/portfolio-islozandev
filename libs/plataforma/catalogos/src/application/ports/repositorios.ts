import type { AjusteItem } from '../../domain/ajuste-item.js';
import type { AtributosItem } from '../../domain/atributos-item.js';
import type { Catalogo } from '../../domain/catalogo.js';
import type { ItemCatalogo } from '../../domain/item-catalogo.js';
import type { EstadoItem, MotivoInvalido } from '../../domain/tipos.js';

/** Catálogos, dentro de la transacción activa. Las escrituras van por funciones SECURITY DEFINER. */
export interface RepositorioCatalogos {
  buscarPorCodigo(codigo: string): Promise<Catalogo | null>;
  buscarPorId(id: string): Promise<Catalogo | null>;
  listar(): Promise<Catalogo[]>;
  /** CatalogoDuplicadoError si el código ya existe. */
  crear(catalogo: Catalogo): Promise<void>;
  /** false si la versión guardada ya no es `versionAnterior`. La función sube la versión en uno. */
  actualizar(catalogo: Catalogo, versionAnterior: number): Promise<boolean>;
}

/** Ítems globales y propios del tenant del contexto, dentro de la transacción activa. */
export interface RepositorioItems {
  /** null si no existe, el id no es un UUID o es propio de otro tenant (RLS). */
  buscar(id: string): Promise<ItemCatalogo | null>;
  /** Con `tenantId`, busca entre los globales y los propios de ese tenant; con null, solo entre los globales. */
  existeCodigo(catalogoId: string, tenantId: string | null, codigo: string): Promise<boolean>;
  /**
   * `versionAnterior` null crea. false si la versión no coincide. CodigoItemDuplicadoError si el código ya
   * lo usa un global o un propio de cualquier tenant.
   */
  guardarGlobal(item: ItemCatalogo, versionAnterior: number | null): Promise<boolean>;
  /** Borra antes sus ajustes. false si no existe o la versión no coincide. */
  eliminarGlobal(id: string, version: number): Promise<boolean>;
  /**
   * Ítem del tenant del contexto. `versionAnterior` null crea. false si la versión no coincide.
   * CodigoItemDuplicadoError si otra transacción ganó la carrera por el código (`ux_cat_item`).
   */
  guardarPropio(item: ItemCatalogo, versionAnterior: number | null): Promise<boolean>;
  /** false si no existe en el tenant del contexto o la versión no coincide. */
  eliminarPropio(id: string, version: number): Promise<boolean>;
}

export interface AjusteGuardado {
  ajuste: AjusteItem;
  version: number;
}

/** Ajustes del tenant del contexto sobre ítems globales de catálogos MIXTO, en la transacción activa. */
export interface RepositorioAjustes {
  buscar(itemId: string): Promise<AjusteGuardado | null>;
  /** `versionAnterior` null crea. false si la versión no coincide o otro creó el ajuste antes. */
  guardar(itemId: string, ajuste: AjusteItem, versionAnterior: number | null, autoria: { por: string; ahora: Date }): Promise<boolean>;
  /** Un ajuste neutro equivale a no tenerlo: se borra la fila. */
  borrar(itemId: string): Promise<void>;
}

export interface Versiones {
  catalogoId: string;
  versionGlobal: number;
  /** 0 si el tenant no tiene propios ni ajustes en el catálogo. */
  versionTenant: number;
}

/** Fila de `cat.items`: nombre con alias y orden con el ajuste ya aplicados. */
export interface FilaItemLeido {
  itemId: string;
  codigo: string;
  codigoExterno: string | null;
  nombre: string;
  atributos: AtributosItem;
  orden: number;
  propio: boolean;
  estado: EstadoItem;
}

/** Lectura con `cat.versiones` y `cat.items`, con la RLS del tenant. */
export interface LecturaItems {
  /** null si el catálogo no existe o el tenant no es el del contexto. */
  versiones(codigo: string, tenantId: string): Promise<Versiones | null>;
  /** Todos los ítems que el tenant puede ver, con su estado en `fecha` (YYYY-MM-DD), por orden y nombre. */
  items(codigo: string, tenantId: string, fecha: string): Promise<FilaItemLeido[]>;
}

export interface ItemVisible {
  itemId: string;
  codigo: string;
  codigoExterno: string | null;
  nombre: string;
  atributos: AtributosItem;
  orden: number;
}

/** Lo que guarda la caché por catálogo, tenant, versiones y fecha. */
export interface ItemsEnCache {
  /** Ordenados por orden y luego nombre. */
  visibles: ItemVisible[];
  /** Por código. */
  noVisibles: Record<string, { motivo: MotivoInvalido; atributos: AtributosItem }>;
}

export interface CacheItems {
  leer(clave: string): Promise<ItemsEnCache | null>;
  guardar(clave: string, valor: ItemsEnCache, ttlSegundos: number): Promise<void>;
}
