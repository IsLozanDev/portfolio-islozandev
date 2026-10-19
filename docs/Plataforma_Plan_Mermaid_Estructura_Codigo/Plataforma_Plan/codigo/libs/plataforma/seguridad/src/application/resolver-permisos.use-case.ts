import type { CachePermisos, PermisosRepositorio } from './ports/permisos.port.js';
import { AccesoDenegadoError } from '../domain/errores.js';

/**
 * Resuelve los permisos efectivos de un usuario en su tenant y sucursal activa.
 * Caché corta (60 s) + invalidación por tenant cuando cambian roles o asignaciones
 * (evento seg.asignacion.* / seg.rol.permisos_cambiados).
 */
export class ResolverPermisosUseCase {
  constructor(
    private readonly repo: PermisosRepositorio,
    private readonly cache: CachePermisos,
    private readonly ttlSegundos = 60,
  ) {}

  async ejecutar(usuarioId: string, tenantId: string, sucursalId: string): Promise<Set<string>> {
    const clave = `perm:${tenantId}:${usuarioId}:${sucursalId}`;
    let permisos = await this.cache.obtener(clave);
    if (!permisos) {
      const sucursales = await this.repo.sucursalesAccesibles(usuarioId, tenantId);
      if (!sucursales.includes(sucursalId)) {
        throw new AccesoDenegadoError('SUCURSAL_NO_ASIGNADA', 'La sucursal no está asignada al usuario');
      }
      permisos = await this.repo.permisosEfectivos(usuarioId, tenantId, sucursalId);
      await this.cache.guardar(clave, permisos, this.ttlSegundos);
    }
    return new Set(permisos);
  }
}
