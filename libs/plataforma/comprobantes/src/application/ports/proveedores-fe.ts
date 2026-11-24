export interface ProveedorFe {
  codigo: string;
  requiereCertificado: boolean;
  /** Serie de la boleta de prueba en beta (atributo `serie_prueba`); null si el ítem no la declara. */
  seriePrueba: string | null;
  /** Hosts a los que el worker puede llamar (atributo `dominios_permitidos`, anti-SSRF). */
  dominiosPermitidos: string[];
}

export interface ProveedoresFe {
  /** ProveedorFeInvalidoError si el ítem no existe o no está vigente en PROVEEDOR_FE. */
  obtener(codigo: string): Promise<ProveedorFe>;
}
