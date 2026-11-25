export interface ProveedorFe {
  codigo: string;
  requiereCertificado: boolean;
  /** Serie de la boleta de prueba en beta (atributo `serie_prueba`); null si el ítem no la declara. */
  seriePrueba: string | null;
  /** Hosts a los que el worker puede llamar (atributo `dominios_permitidos`, anti-SSRF). */
  dominiosPermitidos: string[];
  /** URL fija del servicio en beta (atributo `url_beta`); null si el tenant la escribe. */
  urlBeta: string | null;
  /** URL fija del servicio en producción (atributo `url_produccion`); con ella, el tenant no escribe URL. */
  urlProduccion: string | null;
}

export interface ProveedoresFe {
  /** ProveedorFeInvalidoError si el ítem no existe o no está vigente en PROVEEDOR_FE. */
  obtener(codigo: string): Promise<ProveedorFe>;
}
