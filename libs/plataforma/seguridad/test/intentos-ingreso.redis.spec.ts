import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { ClaveBloqueo } from '../src/application/ports/contador-intentos.port.js';
import { DURACION_BLOQUEO_SEG, VENTANA_INTENTOS_SEG } from '../src/domain/intentos-ingreso.js';
import { crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { ContadorIntentosRedis } from '../src/infrastructure/redis/contador-intentos.redis.js';
import { RegistroSesionesRedis } from '../src/infrastructure/redis/registro-sesiones.redis.js';

// Redis 7 de docker-compose (local) o del servicio de CI, como las demás pruebas de seg.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const REDIS_INACCESIBLE = 'redis://127.0.0.1:1';
const UMBRAL = 3;
const AHORA = Date.parse('2026-11-04T15:00:00Z');
const MS_POR_SEGUNDO = 1000;
const TTL_SESION_SEG = 30 * 24 * 60 * 60;

/** IP de documentación (RFC 5737) con un sufijo propio por prueba, para no chocar entre corridas. */
const ipUnica = () => `198.51.100.7-${randomUUID().slice(0, 8)}`;
const correoUnico = (nombre: string) => `${nombre}.${randomUUID()}@gmail.com`;

describe('ContadorIntentosRedis (spec 18b, Redis 7)', () => {
  let redis: Redis;
  const operacionesFallidas: string[] = [];
  const alFallar = (operacion: string) => operacionesFallidas.push(operacion);
  const contador = () => new ContadorIntentosRedis(redis, alFallar, () => AHORA);

  async function fallarVeces(clave: ClaveBloqueo, veces: number) {
    let ultimo: { bloqueadoHasta: Date | null } = { bloqueadoHasta: null };
    for (let fallo = 0; fallo < veces; fallo += 1) ultimo = await contador().registrarFallo(clave, UMBRAL);
    return ultimo;
  }

  beforeAll(() => {
    redis = crearClienteRedis(REDIS_URL);
  });

  afterAll(() => redis.quit());

  beforeEach(() => {
    operacionesFallidas.length = 0;
  });

  it('por debajo del umbral cuenta sin bloquear', async () => {
    const clave: ClaveBloqueo = { alcance: 'CORREO_IP', correo: correoUnico('ana'), ip: ipUnica() };

    expect(await fallarVeces(clave, UMBRAL - 1)).toEqual({ bloqueadoHasta: null });
    expect(await contador().bloqueoVigente([clave])).toBeNull();
  });

  it('al llegar al umbral bloquea 15 min, borra el contador y el bloqueo se lee', async () => {
    const clave: ClaveBloqueo = { alcance: 'CORREO_IP', correo: correoUnico('ana'), ip: ipUnica() };

    const { bloqueadoHasta } = await fallarVeces(clave, UMBRAL);

    expect(bloqueadoHasta).toEqual(new Date(AHORA + DURACION_BLOQUEO_SEG * MS_POR_SEGUNDO));
    const restantes = await contador().bloqueoVigente([clave]);
    expect(restantes).toBeGreaterThan(DURACION_BLOQUEO_SEG - 5);
    expect(restantes).toBeLessThanOrEqual(DURACION_BLOQUEO_SEG);
    expect(await contador().registrarFallo(clave, UMBRAL)).toEqual({ bloqueadoHasta: null });
  });

  it('el bloqueo de un par correo+IP no alcanza al mismo correo desde otra IP', async () => {
    const correo = correoUnico('ana');
    await fallarVeces({ alcance: 'CORREO_IP', correo, ip: ipUnica() }, UMBRAL);

    expect(await contador().bloqueoVigente([{ alcance: 'CORREO_IP', correo, ip: ipUnica() }])).toBeNull();
  });

  it('devuelve el mayor tiempo restante entre las claves', async () => {
    const ip = ipUnica();
    const porIp: ClaveBloqueo = { alcance: 'IP', ip };
    const porCorreo: ClaveBloqueo = { alcance: 'CORREO_IP', correo: correoUnico('ana'), ip };
    await fallarVeces(porIp, UMBRAL);
    await redis.expire(`seg:ingreso:bloqueo-ip:${ip}`, 100);

    const restantes = await contador().bloqueoVigente([porCorreo, porIp]);

    expect(restantes).toBeLessThanOrEqual(100);
    expect(restantes).toBeGreaterThan(90);
  });

  it('la ventana es fija: un fallo nuevo no renueva el TTL del contador', async () => {
    const usuarioId = randomUUID();
    const claveRedis = `seg:mfa:fallos:${usuarioId}`;
    await contador().registrarFallo({ alcance: 'MFA', usuarioId }, UMBRAL);
    expect(await redis.ttl(claveRedis)).toBeLessThanOrEqual(VENTANA_INTENTOS_SEG);
    await redis.expire(claveRedis, 30);

    await contador().registrarFallo({ alcance: 'MFA', usuarioId }, UMBRAL);

    expect(await redis.ttl(claveRedis)).toBeLessThanOrEqual(30);
    expect(await redis.get(claveRedis)).toBe('2');
  });

  it('limpiar vuelve el contador a cero', async () => {
    const clave: ClaveBloqueo = { alcance: 'CORREO_IP', correo: correoUnico('ana'), ip: ipUnica() };
    await fallarVeces(clave, UMBRAL - 1);

    await contador().limpiar(clave);

    expect(await fallarVeces(clave, UMBRAL - 1)).toEqual({ bloqueadoHasta: null });
  });

  it('no guarda el correo en claro en ninguna clave', async () => {
    const ip = ipUnica();
    const clave: ClaveBloqueo = { alcance: 'CORREO_IP', correo: correoUnico('rosa'), ip };
    await fallarVeces(clave, UMBRAL + 1);

    const claves = await redis.keys(`seg:ingreso:*${ip}`);

    expect(claves.length).toBeGreaterThan(0);
    expect(claves.join(' ')).not.toContain('rosa');
  });

  it('con Redis inaccesible falla abierto y avisa', async () => {
    const caido = crearClienteRedis(REDIS_INACCESIBLE);
    try {
      const sinRedis = new ContadorIntentosRedis(caido, alFallar, () => AHORA);
      const clave: ClaveBloqueo = { alcance: 'IP', ip: ipUnica() };

      expect(await sinRedis.bloqueoVigente([clave])).toBeNull();
      expect(await sinRedis.registrarFallo(clave, 1)).toEqual({ bloqueadoHasta: null });
      await sinRedis.limpiar(clave);

      expect(operacionesFallidas).toEqual(['bloqueo_vigente', 'registrar_fallo', 'limpiar']);
    } finally {
      caido.disconnect();
    }
  });
});

describe('RegistroSesionesRedis (spec 18b, Redis 7)', () => {
  let redis: Redis;
  const operacionesFallidas: string[] = [];
  const alFallar = (operacion: string) => operacionesFallidas.push(operacion);

  beforeAll(() => {
    redis = crearClienteRedis(REDIS_URL);
  });

  afterAll(() => redis.quit());

  it('una sesión es nueva solo la primera vez y se recuerda 30 días', async () => {
    const sesionId = randomUUID();
    const registro = new RegistroSesionesRedis(redis, alFallar);

    expect(await registro.esNueva(sesionId)).toBe(true);
    expect(await registro.esNueva(sesionId)).toBe(false);
    expect(await redis.ttl(`seg:sesion:${sesionId}`)).toBeGreaterThan(TTL_SESION_SEG - 5);
  });

  it('peticiones simultáneas de una sesión nueva dan una sola vez true', async () => {
    const sesionId = randomUUID();
    const registro = new RegistroSesionesRedis(redis, alFallar);

    const respuestas = await Promise.all([registro.esNueva(sesionId), registro.esNueva(sesionId), registro.esNueva(sesionId)]);

    expect(respuestas.filter(Boolean)).toHaveLength(1);
  });

  it('con Redis inaccesible responde false y avisa', async () => {
    const caido = crearClienteRedis(REDIS_INACCESIBLE);
    try {
      expect(await new RegistroSesionesRedis(caido, alFallar).esNueva(randomUUID())).toBe(false);
      expect(operacionesFallidas).toEqual(['sesion_nueva']);
    } finally {
      caido.disconnect();
    }
  });
});
