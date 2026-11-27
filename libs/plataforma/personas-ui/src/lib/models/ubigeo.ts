/** Un distrito del catálogo `UBIGEO`, con los textos como están en el catálogo (en mayúsculas). */
export interface Ubigeo {
  codigo: string;
  distrito: string;
  provincia: string;
  departamento: string;
}

/** Lo que tiene el campo de distrito: el elegido de la lista o lo que se va escribiendo. */
export type ValorUbigeo = Ubigeo | string | null;

/** Lo que dice el campo; cada pantalla pasa los suyos (spec 17d: empresa y sucursal tratan de usted). */
export interface TextosUbigeo {
  ayuda: string;
  ayudaElegido: (ubigeo: Ubigeo) => string;
  error: string;
  errorCarga: string;
  sinPermiso: string;
}

/** `GET /v1/catalogos/UBIGEO/items`: el distrito es el nombre; provincia y departamento, atributos. */
export interface ItemUbigeoRespuesta {
  codigo: string;
  nombre: string;
  atributos: Record<string, unknown>;
}

/** Null si al ítem le falta provincia o departamento: no se puede ofrecer completo. */
export function aUbigeo(item: ItemUbigeoRespuesta): Ubigeo | null {
  const { provincia, departamento } = item.atributos;
  if (typeof provincia !== 'string' || typeof departamento !== 'string') return null;
  return { codigo: item.codigo, distrito: item.nombre, provincia, departamento };
}
