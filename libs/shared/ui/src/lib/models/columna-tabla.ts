export interface ColumnaTabla<Fila> {
  clave: keyof Fila & string;
  titulo: string;
  ordenable?: boolean;
}

export interface CambioPagina {
  indice: number;
  tamano: number;
}

export interface CambioOrden {
  clave: string;
  direccion: 'asc' | 'desc' | '';
}
