import type { Catalogo } from '../../domain/catalogo.js';
import type { ItemCatalogo } from '../../domain/item-catalogo.js';

/** Catálogos, dentro de la transacción activa. Las escrituras van por funciones SECURITY DEFINER. */
export interface RepositorioCatalogos {
  buscarPorCodigo(codigo: string): Promise<Catalogo | null>;
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
}
