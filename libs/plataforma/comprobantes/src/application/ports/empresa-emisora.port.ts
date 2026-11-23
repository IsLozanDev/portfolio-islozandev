export interface EmpresaEmisora {
  id: string;
  ruc: string;
  activa: boolean;
}

/** FE lee la empresa por un puerto propio: su dominio no importa el agregado de ORG. */
export interface EmpresaEmisoraPort {
  /** Del tenant del contexto. EmpresaNoEncontradaError si no existe (también si es de otro tenant). */
  obtener(empresaId: string): Promise<EmpresaEmisora>;
}
