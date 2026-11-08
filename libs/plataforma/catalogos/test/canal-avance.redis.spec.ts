import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { crearClienteRedis } from '@vitrina/plataforma/seguridad';
import type { AvisoImportacion } from '../src/application/ports/importacion.js';
import { CanalAvanceRedis, canalDe, claveAvanceDe } from '../src/infrastructure/redis/canal-avance.redis.js';

// Redis 7 de docker-compose (local) o del servicio de CI.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const TTL_AVANCE_SEGUNDOS = 3_600;

describe('CanalAvanceRedis (spec 19b, Redis 7)', () => {
  let redis: Redis;
  let canal: CanalAvanceRedis;

  beforeAll(() => {
    redis = crearClienteRedis(REDIS_URL);
    canal = new CanalAvanceRedis(redis);
  });

  afterAll(() => redis.quit());

  it('guarda el último aviso con TTL de 1 h', async () => {
    const id = randomUUID();
    await canal.publicar(id, { tipo: 'avance', estado: 'EN_PROCESO', avance: 30 });
    expect(await canal.ultimo(id)).toEqual({ tipo: 'avance', estado: 'EN_PROCESO', avance: 30 });
    const ttl = await redis.ttl(claveAvanceDe(id));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(TTL_AVANCE_SEGUNDOS);
    expect(await canal.ultimo(randomUUID())).toBeNull();
  });

  it('la suscripción recibe lo publicado después de suscribirse y se suelta al abortar', async () => {
    const id = randomUUID();
    const cierre = new AbortController();
    const recibidos: AvisoImportacion[] = [];
    const consumo = (async () => {
      for await (const aviso of canal.suscribir(id, cierre.signal)) recibidos.push(aviso);
    })();
    while (Number((await redis.pubsub('NUMSUB', canalDe(id)))[1]) === 0) await new Promise((resolver) => setTimeout(resolver, 10));

    await canal.publicar(id, { tipo: 'avance', estado: 'EN_PROCESO', avance: 50 });
    await canal.publicar(id, { tipo: 'fin', estado: 'APLICADA', resumen: { altas: 1, cambios: 0, bajas: 0, sin_cambios: 0 }, motivo: null });
    while (recibidos.length < 2) await new Promise((resolver) => setTimeout(resolver, 10));
    cierre.abort();
    await consumo;

    expect(recibidos.map((aviso) => aviso.tipo)).toEqual(['avance', 'fin']);
    // El servidor nota el cierre del socket unos milisegundos después.
    const suscritos = async () => Number((await redis.pubsub('NUMSUB', canalDe(id)))[1]);
    for (let intento = 0; intento < 50 && (await suscritos()) > 0; intento++) await new Promise((resolver) => setTimeout(resolver, 20));
    expect(await suscritos()).toBe(0);
  });
});
