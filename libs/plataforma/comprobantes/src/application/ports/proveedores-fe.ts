export interface ProveedorFe {
  codigo: string;
  requiereCertificado: boolean;
}

export interface ProveedoresFe {
  /** ProveedorFeInvalidoError si el ítem no existe o no está vigente en PROVEEDOR_FE. */
  obtener(codigo: string): Promise<ProveedorFe>;
}
