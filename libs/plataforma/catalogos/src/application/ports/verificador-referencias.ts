export const VERIFICADORES_REFERENCIAS = Symbol('VerificadoresReferencias');

export interface ItemReferenciable {
  itemId: string;
  catalogo: string;
  codigo: string;
}

/**
 * Los productos registran el suyo cuando guardan códigos de un catálogo (spec 25, R2). Por defecto la lista
 * está vacía: nada está referenciado y el ítem se puede borrar.
 */
export interface VerificadorReferencias {
  estaReferenciado(item: ItemReferenciable): Promise<boolean>;
}
