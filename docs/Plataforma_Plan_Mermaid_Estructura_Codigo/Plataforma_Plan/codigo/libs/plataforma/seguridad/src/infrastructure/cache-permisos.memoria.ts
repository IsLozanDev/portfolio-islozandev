import type { CachePermisos } from '../application/ports/permisos.port.js';

/** Caché en memoria para pruebas y desarrollo local. */
export class CachePermisosMemoria implements CachePermisos {
  private readonly datos = new Map<string, { valor: string[]; vence: number }>();
  async obtener(clave: string) {
    const d = this.datos.get(clave);
    if (!d || d.vence < Date.now()) { this.datos.delete(clave); return null; }
    return d.valor;
  }
  async guardar(clave: string, valor: string[], ttl: number) { this.datos.set(clave, { valor, vence: Date.now() + ttl * 1000 }); }
  async invalidarTenant(tenantId: string) { for (const k of this.datos.keys()) if (k.startsWith(`perm:${tenantId}:`)) this.datos.delete(k); }
}
