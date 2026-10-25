import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Redis } from 'ioredis';
import { crearClienteRedis } from '@vitrina/plataforma/seguridad';
import type { ResolucionSql } from '../src/application/ports/repositorios.js';
import { ResolverParametro } from '../src/application/resolver-parametro.js';
import { DefinicionParametro } from '../src/domain/definicion-parametro.js';
import { CacheParametrosRedis } from '../src/infrastructure/redis/cache-parametros.redis.js';

// Redis 7 de docker-compose (local) o del servicio de CI, como las pruebas de seg.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const REDIS_INACCESIBLE = 'redis://127.0.0.1:1';
const RESOLUCIONES_MEDIDAS = 200;
const P95_MAXIMO_MS = 20;
const SESION = 'plat.sesion.minutos_inactividad';

const definicion = DefinicionParametro.reconstituir({
  codigo: SESION,
  productoCodigo: 'PLAT',
  descripcion: 'Minutos de inactividad',
  tipo: 'NUMERO',
  valorDefecto: 30,
  alcanceMaximo: 'TENANT',
  esquema: null,
  obsoleto: false,
});

function percentil95(muestras: number[]): number {
  const ordenadas = [...muestras].sort((a, b) => a - b);
  return ordenadas[Math.ceil(ordenadas.length * 0.95) - 1];
}

function resolverSobre(redis: Redis, tenantId: string) {
  let resolucionesEnBase = 0;
  const resolucion: ResolucionSql = {
    valor: async () => {
      resolucionesEnBase += 1;
      return { valor: 30, origen: 'DEFECTO' };
    },
    versiones: async () => ({ vt: 1, vd: 1 }),
  };
  const resolver = new ResolverParametro(
    { run: (trabajo) => trabajo() },
    { current: () => ({ tenantId }), run: (_alcance, trabajo) => trabajo() },
    { buscar: async () => definicion },
    resolucion,
    new CacheParametrosRedis(redis),
  );
  return { resolver, resolucionesEnBase: () => resolucionesEnBase };
}

describe('CacheParametrosRedis (TR-RNF-101, Redis 7)', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = crearClienteRedis(REDIS_URL);
  });

  afterAll(() => redis.quit());

  it('guarda con TTL y lee lo guardado', async () => {
    const cache = new CacheParametrosRedis(redis);
    const clave = `cfg:prueba:${randomUUID()}`;
    await cache.guardar(clave, { valor: { mesas: 12 }, origen: 'TENANT', obsoleto: false }, 60);

    expect(await cache.leer(clave)).toEqual({ valor: { mesas: 12 }, origen: 'TENANT', obsoleto: false });
    const ttl = await redis.ttl(clave);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
    expect(await cache.leer(`cfg:prueba:${randomUUID()}`)).toBeNull();
  });

  it(`el p95 de ${RESOLUCIONES_MEDIDAS} resoluciones con caché es menor a ${P95_MAXIMO_MS} ms`, async () => {
    const { resolver, resolucionesEnBase } = resolverSobre(redis, randomUUID());
    await resolver.valor(SESION);
    const duraciones: number[] = [];
    for (let vuelta = 0; vuelta < RESOLUCIONES_MEDIDAS; vuelta += 1) {
      const inicio = performance.now();
      await resolver.valor(SESION);
      duraciones.push(performance.now() - inicio);
    }
    expect(resolucionesEnBase()).toBe(1);
    expect(percentil95(duraciones)).toBeLessThan(P95_MAXIMO_MS);
  });

  it('con Redis inaccesible resuelve igual desde la base', async () => {
    const caido = crearClienteRedis(REDIS_INACCESIBLE);
    try {
      const { resolver, resolucionesEnBase } = resolverSobre(caido, randomUUID());
      expect(await resolver.valor(SESION)).toEqual({ valor: 30, origen: 'DEFECTO' });
      expect(resolucionesEnBase()).toBe(1);
    } finally {
      caido.disconnect();
    }
  });
});
