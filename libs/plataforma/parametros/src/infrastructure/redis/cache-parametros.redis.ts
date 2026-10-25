import type { Redis } from 'ioredis';
import type { CacheParametros, ValorEnCache } from '../../application/ports/repositorios.js';

/** Cliente creado con `crearClienteRedis` de seg: sin cola offline, un intento y timeouts cortos. */
export class CacheParametrosRedis implements CacheParametros {
  constructor(private readonly redis: Redis) {}

  async leer(clave: string): Promise<ValorEnCache | null> {
    await this.conectar();
    const guardado = await this.redis.get(clave);
    return guardado === null ? null : (JSON.parse(guardado) as ValorEnCache);
  }

  async guardar(clave: string, valor: ValorEnCache, ttlSegundos: number): Promise<void> {
    await this.conectar();
    await this.redis.set(clave, JSON.stringify(valor), 'EX', ttlSegundos);
  }

  /** lazyConnect: la primera llamada abre la conexión; después ioredis reconecta solo. */
  private async conectar(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}
