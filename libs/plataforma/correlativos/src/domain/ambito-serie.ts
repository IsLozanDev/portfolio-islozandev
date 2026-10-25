/** Con unidad, `sucursalId` es la sucursal de la unidad (o null si es un almacén sin sucursal). */
export interface AmbitoSerie {
  empresaId: string;
  sucursalId: string | null;
  unidadId: string | null;
}
