export const DIRECTORIO_SEG = Symbol('DirectorioSeg');

export interface UsuarioDirectorio {
  id: string;
  nombre: string;
  correo: string;
}

export interface SucursalDirectorio {
  id: string;
  codigo: string;
  nombre: string;
}

/**
 * Nombres de personas y sucursales para componentes que guardan solo ids (spec 20b): no unen tablas de
 * seg ni de org en su SQL. Solo ve el tenant del contexto y corre dentro de la UnitOfWork del llamador.
 */
export interface DirectorioSeg {
  /** Ids de los miembros del tenant cuyo correo o nombre contiene el texto, sin distinguir mayúsculas. */
  buscarUsuarios(texto: string, limite: number): Promise<string[]>;
  /** Los ids que no son miembros del tenant no vuelven. */
  usuarios(ids: readonly string[]): Promise<UsuarioDirectorio[]>;
  sucursales(ids: readonly string[]): Promise<SucursalDirectorio[]>;
}
