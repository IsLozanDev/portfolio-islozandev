export interface PerfilListado {
  id: string;
  codigo: string;
  nombre: string;
  predefinido: boolean;
  totalRoles: number;
  /** Códigos distintos de los productos de sus roles, ordenados. */
  productos: string[];
}

export interface PerfilDetalle extends Omit<PerfilListado, 'totalRoles' | 'productos'> {
  /** Ids de sus roles, ordenados. */
  roles: string[];
}

/** Perfiles visibles para el tenant del contexto: propios y predefinidos (spec 16c). */
export interface LecturaPerfiles {
  /** Propios y predefinidos, por nombre. */
  listar(): Promise<PerfilListado[]>;
  /** Propio del tenant o predefinido; null si no existe o es de otro tenant. */
  detalle(perfilId: string): Promise<PerfilDetalle | null>;
}
