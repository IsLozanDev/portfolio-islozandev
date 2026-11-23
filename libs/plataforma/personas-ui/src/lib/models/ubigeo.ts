/** Un distrito del catálogo `UBIGEO`, con los textos como están en el catálogo (en mayúsculas). */
export interface Ubigeo {
  codigo: string;
  distrito: string;
  provincia: string;
  departamento: string;
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
