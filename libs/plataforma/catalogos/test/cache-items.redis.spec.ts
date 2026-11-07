import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { crearClienteRedis } from '@vitrina/plataforma/seguridad';
import { LectorItems, TTL_ITEMS_SEGUNDOS } from '../src/application/lector-items.js';
import type { ItemsEnCache, LecturaItems } from '../src/application/ports/repositorios.js';
import { CacheItemsRedis } from '../src/infrastructure/redis/cache-items.redis.js';

// Redis 7 de docker-compose (local) o del servicio de CI, como las pruebas de seg y cfg.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const REDIS_INACCESIBLE = 'redis://127.0.0.1:1';

const MEDIOS: ItemsEnCache = {
  visibles: [{ itemId: randomUUID(), codigo: 'YAPE', codigoExterno: null, nombre: 'Yape', atributos: {}, orden: 2 }],
  noVisibles: { PLIN: { motivo: 'OCULTO', atributos: {} } },
};

describe('CacheItemsRedis (TR-RNF-102, Redis 7)', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = crearClienteRedis(REDIS_URL);
  });

  afterAll(() => redis.quit());

  it('guarda con TTL de 24 h y lee lo guardado', async () => {
    const cache = new CacheItemsRedis(redis);
    const clave = `cat:PRUEBA:${randomUUID()}:1.0:2026-10-10`;
    await cache.guardar(clave, MEDIOS, TTL_ITEMS_SEGUNDOS);

    expect(await cache.leer(clave)).toEqual(MEDIOS);
    const ttl = await redis.ttl(clave);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(TTL_ITEMS_SEGUNDOS);
    expect(await cache.leer(`cat:PRUEBA:${randomUUID()}:1.0:2026-10-10`)).toBeNull();
  });

  it('con Redis inaccesible el lector responde desde la base y avisa', async () => {
    const caido = crearClienteRedis(REDIS_INACCESIBLE);
    let lecturasEnBase = 0;
    const lectura: LecturaItems = {
      versiones: async () => ({ catalogoId: randomUUID(), versionGlobal: 1, versionTenant: 0 }),
      items: async () => {
        lecturasEnBase += 1;
        return [{ itemId: MEDIOS.visibles[0].itemId, codigo: 'YAPE', codigoExterno: null, nombre: 'Yape', atributos: {}, orden: 2, propio: false, estado: 'VISIBLE' }];
      },
    };
    const avisos: unknown[] = [];
    try {
      const lector = new LectorItems({ lectura, cache: new CacheItemsRedis(caido), reloj: { now: () => new Date() }, aviso: (_mensaje, datos) => avisos.push(datos) });
      const versiones = await lector.versiones('MEDIO_PAGO', randomUUID());
      const { visibles } = await lector.items('MEDIO_PAGO', randomUUID(), versiones, '2026-10-10');
      expect(visibles.map((item) => item.codigo)).toEqual(['YAPE']);
      expect(lecturasEnBase).toBe(1);
      expect(avisos).toEqual([
        { evento: 'cat.redis.error', error: expect.any(String) },
        { evento: 'cat.redis.error', error: expect.any(String) },
      ]);
    } finally {
      caido.disconnect();
    }
  });
});
