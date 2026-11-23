/** Lo que tienen en común un `Ubigeo` del catálogo y una dirección guardada. */
export interface UbicacionUbigeo {
  departamento: string;
  provincia: string;
  distrito: string;
}

/** «AREQUIPA / AREQUIPA / CAYMA»: departamento, provincia y distrito, como están en el catálogo. */
export function formatoUbigeo({ departamento, provincia, distrito }: UbicacionUbigeo): string {
  return `${departamento} / ${provincia} / ${distrito}`;
}
