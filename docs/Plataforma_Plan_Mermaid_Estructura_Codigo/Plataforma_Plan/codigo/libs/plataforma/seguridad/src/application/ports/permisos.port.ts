/** Puerto de lectura de permisos efectivos (implementado sobre seg.permisos_efectivos). */
export interface PermisosRepositorio {
  permisosEfectivos(usuarioId: string, tenantId: string, sucursalId: string): Promise<string[]>;
  sucursalesAccesibles(usuarioId: string, tenantId: string): Promise<string[]>;
}
export const PERMISOS_REPOSITORIO = Symbol('PERMISOS_REPOSITORIO');

/** Puerto de caché (Redis en producción, memoria en pruebas). */
export interface CachePermisos {
  obtener(clave: string): Promise<string[] | null>;
  guardar(clave: string, valor: string[], ttlSegundos: number): Promise<void>;
  invalidarTenant(tenantId: string): Promise<void>;
}
export const CACHE_PERMISOS = Symbol('CACHE_PERMISOS');
