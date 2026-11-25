/** Cumple `DatosEmisor` del dominio: el documento electrónico se arma con lo que ORG tenga. */
export interface EmpresaEmisora {
  id: string;
  ruc: string;
  activa: boolean;
  razonSocial: string;
  nombreComercial: string | null;
  domicilioFiscal: string | null;
  ubigeo: string | null;
}

/** FE lee la empresa por un puerto propio: su dominio no importa el agregado de ORG. */
export interface EmpresaEmisoraPort {
  /** Del tenant del contexto. EmpresaNoEncontradaError si no existe (también si es de otro tenant). */
  obtener(empresaId: string): Promise<EmpresaEmisora>;
}
