export interface OpcionFiltro {
  valor: string;
  etiqueta: string;
}

export interface DefinicionFiltro {
  clave: string;
  etiqueta: string;
  opciones: OpcionFiltro[];
}

export type ValorFiltros = { busqueda: string } & Record<string, string | null>;
