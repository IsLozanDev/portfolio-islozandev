import type { Redis } from 'ioredis';
import type { CachePermisos } from '../application/ports/permisos.port.js';

/**
 * Caché en Redis. Las claves de un tenant se agrupan en un SET índice para
 * invalidarlas juntas sin usar KEYS/SCAN sobre toda la base.
 */
export class CachePermisosRedis implements CachePermisos {
  constructor(private readonly redis: Redis) {}
  async obtener(clave: string) {
    const v = await this.redis.get(clave);
    return v ? (JSON.parse(v) as string[]) : null;
  }
  async guardar(clave: string, valor: string[], ttl: number) {
    const tenant = clave.split(':')[1];
    await this.redis.multi().set(clave, JSON.stringify(valor), 'EX', ttl).sadd(`perm-idx:${tenant}`, clave).expire(`perm-idx:${tenant}`, ttl * 2).exec();
  }
  async invalidarTenant(tenantId: string) {
    const idx = `perm-idx:${tenantId}`;
    const claves = await this.redis.smembers(idx);
    if (claves.length) await this.redis.del(...claves);
    await this.redis.del(idx);
  }
}
