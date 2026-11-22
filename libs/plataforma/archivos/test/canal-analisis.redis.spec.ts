import { randomUUID } from 'node:crypto';
import { crearClienteRedis } from '@vitrina/plataforma/seguridad';
import type { Redis } from 'ioredis';
import type { ResultadoAnalisis } from '../src/application/ports/canal-analisis.js';
import { CanalAnalisisRedis, canalAnalisisDe, claveResultadoDe } from '../src/infrastructure/redis/canal-analisis.redis.js';

// Redis 7 de docker-compose (local) o del servicio de CI.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const TTL_RESULTADO_SEGUNDOS = 3_600;
const USUARIO = 'cccccccc-0000-4000-8000-000000000003';

const esperar = (milisegundos: number) => new Promise((resolver) => setTimeout(resolver, milisegundos));
const resultadoDe = (archivoId: string, numero: number, cambios: Partial<ResultadoAnalisis> = {}): ResultadoAnalisis => ({
  archivoId,
  numero,
  resultado: 'DISPONIBLE',
  subidoPor: USUARIO,
  ...cambios,
});

describe('CanalAnalisisRedis (spec 36, Redis 7)', () => {
  let redis: Redis;
  let canal: CanalAnalisisRedis;
  const suscritos = async (archivoId: string, numero: number) => Number((await redis.pubsub('NUMSUB', canalAnalisisDe(archivoId, numero)))[1]);

  beforeAll(() => {
    redis = crearClienteRedis(REDIS_URL);
    canal = new CanalAnalisisRedis(redis);
  });

  afterAll(() => redis.quit());

  it('guarda el último resultado por archivo y versión con TTL de 1 h', async () => {
    const archivoId = randomUUID();
    await canal.publicar(resultadoDe(archivoId, 2, { resultado: 'RECHAZADO', motivoRechazo: 'IDENTICA', versionCoincidente: 1 }));

    expect(await canal.ultimo(archivoId, 2)).toEqual(resultadoDe(archivoId, 2, { resultado: 'RECHAZADO', motivoRechazo: 'IDENTICA', versionCoincidente: 1 }));
    expect(await canal.ultimo(archivoId, 1)).toBeNull();
    const ttl = await redis.ttl(claveResultadoDe(archivoId, 2));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(TTL_RESULTADO_SEGUNDOS);
  });

  it('un resultado publicado antes de que la suscripción quedara abierta llega igual, desde el guardado', async () => {
    const archivoId = randomUUID();
    await canal.publicar(resultadoDe(archivoId, 1));
    const cierre = new AbortController();

    const suscripcion = canal.suscribir(archivoId, 1, cierre.signal);
    const primero = await suscripcion.next();
    cierre.abort();
    await suscripcion.return(undefined);

    expect(primero.value).toEqual(resultadoDe(archivoId, 1));
  });

  it('la suscripción recibe solo lo de su versión, publicado después de suscribirse, y se suelta al abortar', async () => {
    const archivoId = randomUUID();
    const cierre = new AbortController();
    const recibidos: ResultadoAnalisis[] = [];
    const consumo = (async () => {
      for await (const resultado of canal.suscribir(archivoId, 1, cierre.signal)) recibidos.push(resultado);
    })();
    while ((await suscritos(archivoId, 1)) === 0) await esperar(10);

    await canal.publicar(resultadoDe(archivoId, 2));
    await canal.publicar(resultadoDe(archivoId, 1, { resultado: 'CUARENTENA' }));
    while (recibidos.length < 1) await esperar(10);
    cierre.abort();
    await consumo;

    expect(recibidos).toEqual([resultadoDe(archivoId, 1, { resultado: 'CUARENTENA' })]);
    for (let intento = 0; intento < 50 && (await suscritos(archivoId, 1)) > 0; intento++) await esperar(20);
    expect(await suscritos(archivoId, 1)).toBe(0);
  });
});
