import { Redis } from 'ioredis';
import type { CachePermisos, PermisosResueltos } from '../../application/ports/permisos.port.js';

/** El índice dura más que las claves: solo sirve para borrar las del tenant sin KEYS ni SCAN. */
const TTL_INDICE_SEG = 3600;

const indice = (tenantId: string) => `perm-idx:${tenantId}`;

/**
 * Sin cola offline y con un solo intento por comando: si Redis está caído, el comando falla de
 * inmediato y ResolverPermisos resuelve desde la base en vez de esperar la reconexión.
 */
export function crearClienteRedis(url: string, alFallar: (error: Error) => void = () => undefined): Redis {
  const redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 500, connectTimeout: 1000 });
  // Sin listener, ioredis escribe cada reintento como "Unhandled error event".
  redis.on('error', alFallar);
  return redis;
}

export class CachePermisosRedis implements CachePermisos {
  constructor(private readonly redis: Redis) {}

  async leer(clave: string): Promise<PermisosResueltos | null> {
    await this.conectar();
    const valor = await this.redis.get(clave);
    return valor === null ? null : (JSON.parse(valor) as PermisosResueltos);
  }

  async guardar(clave: string, tenantId: string, valor: PermisosResueltos, ttlSeg: number): Promise<void> {
    await this.conectar();
    await this.redis
      .pipeline()
      .set(clave, JSON.stringify(valor), 'EX', ttlSeg)
      .sadd(indice(tenantId), clave)
      .expire(indice(tenantId), TTL_INDICE_SEG)
      .exec();
  }

  async invalidarTenant(tenantId: string): Promise<void> {
    await this.conectar();
    const claves = await this.redis.smembers(indice(tenantId));
    await this.redis.del(...claves, indice(tenantId));
  }

  /** lazyConnect: la primera llamada abre la conexión; después ioredis reconecta solo. */
  private async conectar(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}
