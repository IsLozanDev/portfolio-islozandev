import type { Redis } from 'ioredis';
import type { CacheItems, ItemsEnCache } from '../../application/ports/repositorios.js';

/** Cliente creado con `crearClienteRedis` de seg: sin cola offline, un intento y timeouts cortos. */
export class CacheItemsRedis implements CacheItems {
  constructor(private readonly redis: Redis) {}

  async leer(clave: string): Promise<ItemsEnCache | null> {
    await this.conectar();
    const guardado = await this.redis.get(clave);
    return guardado === null ? null : (JSON.parse(guardado) as ItemsEnCache);
  }

  async guardar(clave: string, valor: ItemsEnCache, ttlSegundos: number): Promise<void> {
    await this.conectar();
    await this.redis.set(clave, JSON.stringify(valor), 'EX', ttlSegundos);
  }

  /** lazyConnect: la primera llamada abre la conexión; después ioredis reconecta solo. */
  private async conectar(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}
