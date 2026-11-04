import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CanActivate, ExecutionContext, INestApplication, LoggerService } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { IngresarConClave, type DependenciasIngreso } from '../src/application/ingresar-con-clave.js';
import { VerificarMfa } from '../src/application/verificar-mfa.js';
import { crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { ContadorIntentosRedis } from '../src/infrastructure/redis/contador-intentos.redis.js';
import { ProveedorIngresoGotrue } from '../src/infrastructure/supabase/proveedor-ingreso.gotrue.js';
import { PUBLICO } from '../src/interface/decoradores.js';
import { IngresoController } from '../src/interface/ingreso.controller.js';
import { BitacoraIngresoEnMemoria } from './support/ingreso-en-memoria.js';

// Redis 7 de docker-compose (local) o del servicio de CI, como las demás pruebas de seg.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const REDIS_INACCESIBLE = 'redis://127.0.0.1:1';
const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const ROSA = '0193f3a0-0000-7000-8000-000000000901';
const FACTOR = '0193f3a0-0000-7000-8000-00000000fa01';
const CLAVE_CORRECTA = 'Clave-correcta-1';
const CLAVE_MALA = 'Clave-mala-secreta-9';
const CODIGO_CORRECTO = '123456';
const CODIGO_MALO = '654321';
const TOKEN_AAL1 = 'token-aal1-de-rosa';
const TIEMPO_MAXIMO_PRUEBA_MS = 300;

/** GoTrue simulado: acepta una sola clave y un solo código. En modo caído responde 503. */
class GotrueSimulado {
  caido = false;
  peticiones = 0;
  private servidor!: Server;
  url = '';

  async iniciar(): Promise<void> {
    this.servidor = createServer(async (req, res) => {
      this.peticiones += 1;
      const cuerpo = JSON.parse((await leer(req)) || '{}') as Record<string, string>;
      const [estado, respuesta] = this.responder(req.url ?? '', cuerpo);
      res.writeHead(estado, { 'content-type': 'application/json' });
      res.end(JSON.stringify(respuesta));
    });
    await new Promise<void>((ok) => this.servidor.listen(0, '127.0.0.1', ok));
    this.url = `http://127.0.0.1:${(this.servidor.address() as AddressInfo).port}`;
  }

  detener(): Promise<void> {
    return new Promise((ok) => this.servidor.close(() => ok()));
  }

  private responder(ruta: string, cuerpo: Record<string, string>): [number, unknown] {
    if (this.caido) return [503, {}];
    const sesion = { access_token: 'token-nuevo', refresh_token: 'refresh-nuevo', expires_in: 3600, token_type: 'bearer', user: { id: ROSA } };
    if (ruta.endsWith('/challenge')) return [200, { id: randomUUID() }];
    if (ruta.endsWith('/verify')) return cuerpo['code'] === CODIGO_CORRECTO ? [200, sesion] : [400, { code: 400, error_code: 'mfa_verification_failed' }];
    return cuerpo['password'] === CLAVE_CORRECTA ? [200, sesion] : [400, { code: 400, error_code: 'invalid_credentials' }];
  }
}

const leer = (req: IncomingMessage) =>
  new Promise<string>((ok) => {
    let datos = '';
    req.on('data', (parte) => (datos += parte));
    req.on('end', () => ok(datos));
  });

/** Sustituye a AutenticacionGuard: con Bearer pone el principal de Rosa; las rutas @Publico pasan. */
class AutenticacionDePrueba implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    if (req.headers.authorization !== `Bearer ${TOKEN_AAL1}`) return false;
    req.principal = { usuarioId: ROSA, tenantId: TENANT, tipo: 'INTERNO', aal: 'aal1', sesionId: 's-1', amr: [] };
    return true;
  }
}

/** Junta todo lo que se loguea, de Nest y de los casos de uso, para buscar datos en claro. */
class LogsCapturados implements LoggerService {
  readonly lineas: string[] = [];
  log = (...partes: unknown[]) => this.guardar(partes);
  error = (...partes: unknown[]) => this.guardar(partes);
  warn = (...partes: unknown[]) => this.guardar(partes);
  debug = (...partes: unknown[]) => this.guardar(partes);
  verbose = (...partes: unknown[]) => this.guardar(partes);

  guardar(partes: unknown[]): void {
    this.lineas.push(JSON.stringify(partes));
  }
}

describe('Ingreso por la API (HTTP con Redis 7 y un Auth simulado, spec 18b)', () => {
  const gotrue = new GotrueSimulado();
  const logs = new LogsCapturados();
  let redis: Redis;

  async function levantar(clienteRedis: Redis) {
    const bitacora = new BitacoraIngresoEnMemoria();
    const dependencias: DependenciasIngreso = {
      proveedor: new ProveedorIngresoGotrue(gotrue.url, 'sb_publishable_prueba', { tiempoMaximoMs: TIEMPO_MAXIMO_PRUEBA_MS }),
      contador: new ContadorIntentosRedis(clienteRedis, (operacion) => logs.guardar(['redis', operacion])),
      bitacora,
      avisar: (mensaje, datos) => logs.guardar([mensaje, datos]),
    };
    const modulo = await Test.createTestingModule({
      controllers: [IngresoController],
      providers: [
        { provide: APP_GUARD, useFactory: (reflector: Reflector) => new AutenticacionDePrueba(reflector), inject: [Reflector] },
        { provide: IngresarConClave, useValue: new IngresarConClave(dependencias) },
        { provide: VerificarMfa, useValue: new VerificarMfa(dependencias) },
      ],
    }).compile();
    const app = modulo.createNestApplication({ logger: logs });
    // Para variar la IP con X-Forwarded-For; en la api real es del spec de despliegue.
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    await app.init();
    return { app, bitacora };
  }

  let app: INestApplication;
  let bitacora: BitacoraIngresoEnMemoria;
  /** IPv6 de documentación (RFC 3849) única por prueba: los contadores por IP duran 15 min entre corridas. */
  const ipUnica = () => `2001:db8::${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}`;
  const correoUnico = () => `rosa.${randomUUID().slice(0, 8)}@gmail.com`;
  const ingresar = (correo: string, clave: string, ip: string) =>
    request(app.getHttpServer()).post('/seg/auth/ingresar').set('X-Forwarded-For', ip).set('User-Agent', 'Firefox/140').send({ correo, clave });
  const verificar = (codigo: string, ip: string) =>
    request(app.getHttpServer()).post('/seg/auth/mfa/verificar').set('Authorization', `Bearer ${TOKEN_AAL1}`).set('X-Forwarded-For', ip).send({ factorId: FACTOR, codigo });

  beforeAll(async () => {
    await gotrue.iniciar();
    redis = crearClienteRedis(REDIS_URL);
    ({ app, bitacora } = await levantar(redis));
  });

  afterAll(async () => {
    await app.close();
    await redis.quit();
    await gotrue.detener();
  });

  beforeEach(() => {
    gotrue.caido = false;
    bitacora.eventos.length = 0;
  });

  it('la clave correcta devuelve la sesión para setSession', async () => {
    const respuesta = await ingresar(correoUnico(), CLAVE_CORRECTA, ipUnica());

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ access_token: 'token-nuevo', refresh_token: 'refresh-nuevo', expires_in: 3600, token_type: 'bearer' });
  });

  it('un cuerpo inválido es 400 con los nombres de los campos, sin los valores', async () => {
    const respuesta = await request(app.getHttpServer()).post('/seg/auth/ingresar').send({ correo: 'ro', clave: 'x'.repeat(80) });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores: ['correo', 'clave'] });
  });

  it('el quinto fallo del mismo correo e IP es 429 con Retry-After, y el sexto no llega a Auth aun con la clave correcta', async () => {
    const correo = correoUnico();
    const ip = ipUnica();
    for (let intento = 1; intento < 5; intento += 1) {
      const respuesta = await ingresar(correo, CLAVE_MALA, ip);
      expect(respuesta.status).toBe(401);
      expect(respuesta.body.codigo).toBe('CREDENCIALES_INVALIDAS');
    }

    const quinto = await ingresar(correo, CLAVE_MALA, ip);
    expect(quinto.status).toBe(429);
    expect(quinto.headers['retry-after']).toBe('900');
    expect(quinto.body).toEqual({ codigo: 'INGRESO_BLOQUEADO', mensaje: 'Demasiados intentos. Vuelva a intentarlo en 15 minutos', reintentarEnSeg: 900 });
    expect(bitacora.eventos.at(-1)?.detalle).toMatchObject({ motivo: 'BLOQUEO_INGRESO', alcance: 'CORREO_IP' });

    const peticionesAntes = gotrue.peticiones;
    const filasAntes = bitacora.eventos.length;
    const sexto = await ingresar(correo, CLAVE_CORRECTA, ip);
    expect(sexto.status).toBe(429);
    expect(Number(sexto.headers['retry-after'])).toBeGreaterThan(890);
    expect(gotrue.peticiones).toBe(peticionesAntes);
    expect(bitacora.eventos).toHaveLength(filasAntes);

    expect((await ingresar(correo, CLAVE_CORRECTA, ipUnica())).status).toBe(200);
  });

  it('20 fallos desde una IP con correos distintos bloquean esa IP', async () => {
    const ip = ipUnica();
    for (let intento = 1; intento < 20; intento += 1) expect((await ingresar(correoUnico(), CLAVE_MALA, ip)).status).toBe(401);

    expect((await ingresar(correoUnico(), CLAVE_MALA, ip)).status).toBe(429);
    expect(bitacora.eventos.at(-1)?.detalle).toMatchObject({ motivo: 'BLOQUEO_INGRESO', alcance: 'IP' });
    expect((await ingresar(correoUnico(), CLAVE_CORRECTA, ip)).status).toBe(429);
  });

  it('un ingreso exitoso tras 3 fallos deja el contador de correo+IP en cero', async () => {
    const correo = correoUnico();
    const ip = ipUnica();
    for (let intento = 1; intento <= 3; intento += 1) await ingresar(correo, CLAVE_MALA, ip);
    expect((await ingresar(correo, CLAVE_CORRECTA, ip)).status).toBe(200);

    for (let intento = 1; intento <= 4; intento += 1) expect((await ingresar(correo, CLAVE_MALA, ip)).status).toBe(401);
  });

  it('MFA: cuatro códigos malos dan 400, el quinto 429, y luego ni el correcto pasa', async () => {
    await redis.del(`seg:mfa:fallos:${ROSA}`, `seg:mfa:bloqueo:${ROSA}`);
    const ip = ipUnica();
    for (let intento = 1; intento < 5; intento += 1) {
      const respuesta = await verificar(CODIGO_MALO, ip);
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.codigo).toBe('CODIGO_MFA_INVALIDO');
    }

    expect((await verificar(CODIGO_MALO, ip)).status).toBe(429);
    expect(bitacora.eventos.at(-1)).toMatchObject({ tenantId: TENANT, usuarioId: ROSA, detalle: { etapa: 'MFA', motivo: 'BLOQUEO_MFA' } });
    expect((await verificar(CODIGO_CORRECTO, ip)).status).toBe(429);
    await redis.del(`seg:mfa:bloqueo:${ROSA}`);
  });

  it('MFA: el código correcto devuelve la sesión aal2; sin Bearer no entra', async () => {
    await redis.del(`seg:mfa:fallos:${ROSA}`, `seg:mfa:bloqueo:${ROSA}`);

    expect((await verificar(CODIGO_CORRECTO, ipUnica())).body).toMatchObject({ access_token: 'token-nuevo' });
    expect((await request(app.getHttpServer()).post('/seg/auth/mfa/verificar').send({ factorId: FACTOR, codigo: CODIGO_CORRECTO })).status).toBe(403);
  });

  it('Auth caído es 503 INGRESO_NO_DISPONIBLE y no cuenta como fallo', async () => {
    gotrue.caido = true;
    const correo = correoUnico();
    const ip = ipUnica();
    for (let intento = 1; intento <= 6; intento += 1) {
      const respuesta = await ingresar(correo, CLAVE_MALA, ip);
      expect(respuesta.status).toBe(503);
      expect(respuesta.body.codigo).toBe('INGRESO_NO_DISPONIBLE');
    }
    expect(bitacora.eventos).toEqual([]);

    gotrue.caido = false;
    expect((await ingresar(correo, CLAVE_MALA, ip)).status).toBe(401);
  });

  it('con Redis caído el ingreso sigue sin bloqueo, registra el fallo y avisa', async () => {
    const caido = crearClienteRedis(REDIS_INACCESIBLE);
    const sinRedis = await levantar(caido);
    try {
      const correo = correoUnico();
      const ip = ipUnica();
      for (let intento = 1; intento <= 6; intento += 1) {
        expect((await request(sinRedis.app.getHttpServer()).post('/seg/auth/ingresar').set('X-Forwarded-For', ip).send({ correo, clave: CLAVE_MALA })).status).toBe(401);
      }
      expect(sinRedis.bitacora.eventos).toHaveLength(6);
      expect((await request(sinRedis.app.getHttpServer()).post('/seg/auth/ingresar').set('X-Forwarded-For', ip).send({ correo, clave: CLAVE_CORRECTA })).status).toBe(200);
      expect(logs.lineas.some((linea) => linea.includes('registrar_fallo'))).toBe(true);
    } finally {
      await sinRedis.app.close();
      caido.disconnect();
    }
  });

  it('ni los logs ni la bitácora ni Redis guardan la clave, el código ni el correo en claro', async () => {
    const correo = correoUnico();
    const ip = ipUnica();
    for (let intento = 1; intento <= 5; intento += 1) await ingresar(correo, CLAVE_MALA, ip);
    await redis.del(`seg:mfa:fallos:${ROSA}`);
    await verificar(CODIGO_MALO, ip);

    const guardado = [...logs.lineas, JSON.stringify(bitacora.eventos), (await redis.keys(`seg:*${ip}*`)).join(' ')].join('\n');
    expect(guardado).not.toContain(CLAVE_MALA);
    expect(guardado).not.toContain(CODIGO_MALO);
    expect(guardado).not.toContain(correo);
    await redis.del(`seg:mfa:fallos:${ROSA}`);
  });
});
