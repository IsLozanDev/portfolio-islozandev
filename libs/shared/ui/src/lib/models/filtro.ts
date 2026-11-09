export interface OpcionFiltro {
  valor: string;
  etiqueta: string;
}

export interface DefinicionFiltro {
  clave: string;
  etiqueta: string;
  opciones: OpcionFiltro[];
  /** Texto de la opción sin filtro; «Todos» si no viene. */
  textoTodos?: string;
}

export type ValorFiltros = { busqueda: string } & Record<string, string | null>;
