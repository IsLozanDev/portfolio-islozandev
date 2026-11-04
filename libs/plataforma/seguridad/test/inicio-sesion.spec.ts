import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import request from 'supertest';
import type { RegistroSesiones } from '../src/application/ports/registro-sesiones.port.js';
import type { VerificadorToken } from '../src/application/ports/verificador-token.port.js';
import { RegistrarInicioSesion } from '../src/application/registrar-inicio-sesion.js';
import type { Principal } from '../src/domain/principal.js';
import { crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { RegistroSesionesRedis } from '../src/infrastructure/redis/registro-sesiones.redis.js';
import { AutenticacionGuard } from '../src/interface/autenticacion.guard.js';
import { BitacoraIngresoEnMemoria } from './support/ingreso-en-memoria.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const ROSA = '0193f3a0-0000-7000-8000-000000000901';
const ESPERA_MAXIMA_MS = 2_000;

const principal = (sesionId: string, cambios: Partial<Principal> = {}): Principal => ({
  usuarioId: ROSA,
  tenantId: TENANT,
  tipo: 'INTERNO',
  aal: 'aal1',
  sesionId,
  amr: [{ method: 'password', timestamp: 1_700_000_000 }],
  ...cambios,
});

const sesionesEnMemoria = (): RegistroSesiones => {
  const vistas = new Set<string>();
  return { esNueva: async (sesionId) => !vistas.has(sesionId) && Boolean(vistas.add(sesionId)) };
};

describe('RegistrarInicioSesion (spec 18b)', () => {
  it('escribe LOGIN una sola vez por sesión, con el método más reciente del amr', async () => {
    const bitacora = new BitacoraIngresoEnMemoria();
    const registrar = new RegistrarInicioSesion({ sesiones: sesionesEnMemoria(), bitacora, avisar: () => undefined });
    const conMfa = principal('s-1', {
      aal: 'aal2',
      amr: [
        { method: 'totp', timestamp: 1_700_000_100 },
        { method: 'password', timestamp: 1_700_000_000 },
      ],
    });

    await registrar.ejecutar({ principal: conMfa, ip: '190.42.10.8', agente: 'x'.repeat(250) });
    await registrar.ejecutar({ principal: conMfa, ip: '190.42.10.8', agente: 'Firefox' });

    expect(bitacora.eventos).toEqual([
      {
        tipo: 'LOGIN',
        tenantId: TENANT,
        usuarioId: ROSA,
        detalle: { sesion_id: 's-1', metodo: 'totp', aal: 'aal2', agente: 'x'.repeat(200) },
        ip: '190.42.10.8',
      },
    ]);
  });

  it('un ingreso con Google queda con metodo oauth; sin tenant en el token, sin tenant', async () => {
    const bitacora = new BitacoraIngresoEnMemoria();
    const registrar = new RegistrarInicioSesion({ sesiones: sesionesEnMemoria(), bitacora, avisar: () => undefined });

    await registrar.ejecutar({ principal: principal('s-2', { tenantId: null, amr: [{ method: 'oauth', timestamp: 1 }] }), ip: null, agente: null });

    expect(bitacora.eventos[0]).toMatchObject({ tenantId: null, detalle: { metodo: 'oauth', agente: null } });
  });

  it('si la bitácora falla, avisa con el nombre del error y no lanza', async () => {
    const bitacora = new BitacoraIngresoEnMemoria();
    bitacora.fallaAlEscribir = true;
    const avisos: unknown[] = [];
    const registrar = new RegistrarInicioSesion({ sesiones: sesionesEnMemoria(), bitacora, avisar: (mensaje, datos) => avisos.push({ mensaje, datos }) });

    await expect(registrar.ejecutar({ principal: principal('s-3'), ip: null, agente: null })).resolves.toBeUndefined();
    expect(avisos).toEqual([{ mensaje: 'seg.login.error', datos: { error: 'Error' } }]);
  });
});

@Controller('prueba')
class RutaProtegida {
  @Get()
  ruta(): { ok: true } {
    return { ok: true };
  }
}

/** El guard real con Redis 7: el verificador es un doble que lee la sesión del propio token. */
describe('LOGIN desde AutenticacionGuard (HTTP con Redis 7, spec 18b)', () => {
  let app: INestApplication;
  let redis: Redis;
  const bitacora = new BitacoraIngresoEnMemoria();
  const verificador: VerificadorToken = { verificar: async (token) => principal(token) };

  const pedir = (sesionId: string) => request(app.getHttpServer()).get('/prueba').set('Authorization', `Bearer ${sesionId}`).set('User-Agent', 'Firefox/140');

  async function esperarFilas(cantidad: number): Promise<void> {
    const limite = Date.now() + ESPERA_MAXIMA_MS;
    while (bitacora.eventos.length < cantidad && Date.now() < limite) await new Promise((ok) => setTimeout(ok, 20));
  }

  beforeAll(async () => {
    redis = crearClienteRedis(REDIS_URL);
    const inicioSesion = new RegistrarInicioSesion({ sesiones: new RegistroSesionesRedis(redis, () => undefined), bitacora, avisar: () => undefined });
    const modulo = await Test.createTestingModule({
      controllers: [RutaProtegida],
      providers: [
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector) => new AutenticacionGuard(reflector, verificador, { marcar: async () => undefined }, inicioSesion),
          inject: [Reflector],
        },
      ],
    }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await redis.quit();
  });

  it('dos peticiones de la misma sesión dejan un LOGIN; otra sesión deja el segundo', async () => {
    const primera = randomUUID();
    const segunda = randomUUID();

    expect((await pedir(primera)).status).toBe(200);
    expect((await pedir(primera)).status).toBe(200);
    await esperarFilas(1);
    expect((await pedir(segunda)).status).toBe(200);
    await esperarFilas(2);
    await new Promise((ok) => setTimeout(ok, 100));

    expect(bitacora.eventos.map((evento) => evento.detalle['sesion_id'])).toEqual([primera, segunda]);
    expect(bitacora.eventos[0]).toMatchObject({ tipo: 'LOGIN', tenantId: TENANT, usuarioId: ROSA, detalle: { metodo: 'password', agente: 'Firefox/140' } });
    expect(bitacora.eventos[0]?.ip).toEqual(expect.stringContaining('127.0.0.1'));
  });

  it('una petición sin Bearer no registra nada', async () => {
    const antes = bitacora.eventos.length;

    expect((await request(app.getHttpServer()).get('/prueba')).status).toBe(401);
    expect(bitacora.eventos).toHaveLength(antes);
  });
});
