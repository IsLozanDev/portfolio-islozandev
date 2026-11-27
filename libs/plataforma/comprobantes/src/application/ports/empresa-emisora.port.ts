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

/** Anexo SUNAT de la sucursal principal activa de la empresa: el establecimiento de la boleta de prueba. */
export interface EstablecimientoPrincipalPort {
  /** null si la empresa no tiene sucursal principal activa o ORG no tiene su anexo. */
  codigo(empresaId: string): Promise<string | null>;
}

/** FE lee la empresa por un puerto propio: su dominio no importa el agregado de ORG. */
export interface EmpresaEmisoraPort {
  /** Del tenant del contexto. EmpresaNoEncontradaError si no existe (también si es de otro tenant). */
  obtener(empresaId: string): Promise<EmpresaEmisora>;
  /** Las empresas activas del tenant del contexto, por razón social. */
  listarActivas(): Promise<EmpresaEmisora[]>;
}
