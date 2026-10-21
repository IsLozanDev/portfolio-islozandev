import 'reflect-metadata';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { RegistrarEmpresa } from '@vitrina/plataforma/org';
import { REGISTRO_ACCESO } from '@vitrina/plataforma/seguridad';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { cargarConfig } from '../src/config/env.js';

const SUPABASE_URL = 'https://proyecto-prueba.supabase.co';
const ENV_MINIMO = { DATABASE_URL: 'postgres://localhost:5432/vitrina', SUPABASE_URL };

describe('api', () => {
  let app: INestApplication;
  let jwks: Server;
  let token: string;

  beforeAll(async () => {
    // JWKS local con una llave ES256: la API no sale a Supabase en las pruebas.
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
    const jwk = { ...(await exportJWK(publicKey)), kid: 'kid-api', alg: 'ES256' };
    jwks = createServer((_req, res) => res.end(JSON.stringify({ keys: [jwk] })));
    await new Promise<void>((ok) => jwks.listen(0, '127.0.0.1', ok));
    const { port } = jwks.address() as AddressInfo;

    token = await new SignJWT({ role: 'authenticated', aal: 'aal1', session_id: 's-1', amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }], tenant_id: null, tipo_usuario: 'EXTERNO' })
      .setProtectedHeader({ alg: 'ES256', kid: 'kid-api' })
      .setSubject('0193f3a0-0000-7000-8000-000000000001')
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    // Sin initialize(): estas pruebas no tocan la base.
    const opciones = {
      dataSource: new DataSource({ type: 'postgres' }),
      validator: new InMemoryEventSchemaValidator(),
      supabaseUrl: SUPABASE_URL,
      mfaMaxEdadSeg: 900,
      jwksUrl: `http://127.0.0.1:${port}/auth/v1/.well-known/jwks.json`,
    };
    const modulo = await Test.createTestingModule({ imports: [AppModule.register(opciones)] })
      .overrideProvider(REGISTRO_ACCESO)
      .useValue({ marcar: async () => undefined })
      .compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise((ok) => jwks.close(ok));
  });

  it('GET /v1/salud responde 200 sin token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/salud');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok' });
  });

  it('GET /v1/seg/sesion sin token responde 401 TOKEN_INVALIDO', async () => {
    const res = await request(app.getHttpServer()).get('/v1/seg/sesion');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ codigo: 'TOKEN_INVALIDO' });
  });

  it('GET /v1/seg/sesion con token válido devuelve los datos del token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/seg/sesion').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      usuario_id: '0193f3a0-0000-7000-8000-000000000001',
      tenant_id: null,
      tipo_usuario: 'EXTERNO',
      aal: 'aal1',
      mfa_vigente: false,
      mfa_en: null,
    });
  });

  it('GET /v1/docs-json publica /v1/salud y /v1/seg/sesion con bearer auth', async () => {
    const res = await request(app.getHttpServer()).get('/v1/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.paths['/v1/salud'].get).toBeDefined();
    expect(res.body.paths['/v1/seg/sesion'].get.security).toEqual([{ bearer: [] }]);
    expect(res.body.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('OrgModule queda cableado: los casos de uso de org se resuelven', () => {
    expect(app.get(RegistrarEmpresa)).toBeInstanceOf(RegistrarEmpresa);
  });

  it('cargarConfig rechaza un PORT inválido', () => {
    expect(() => cargarConfig({ ...ENV_MINIMO, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('cargarConfig exige DATABASE_URL postgres y no repite su valor en el error', () => {
    expect(() => cargarConfig({ SUPABASE_URL })).toThrow(/DATABASE_URL/);
    expect(() => cargarConfig({ SUPABASE_URL, DATABASE_URL: 'mysql://usuario:clave-secreta@host/db' })).toThrow(/DATABASE_URL/);
    expect(() => cargarConfig({ SUPABASE_URL, DATABASE_URL: 'mysql://usuario:clave-secreta@host/db' })).not.toThrow(/clave-secreta/);
    expect(cargarConfig(ENV_MINIMO).DATABASE_URL).toBe('postgres://localhost:5432/vitrina');
  });

  it('cargarConfig exige SUPABASE_URL y toma SEG_MFA_MAX_EDAD_SEG con 900 por defecto', () => {
    expect(() => cargarConfig({ DATABASE_URL: ENV_MINIMO.DATABASE_URL })).toThrow(/SUPABASE_URL/);
    expect(cargarConfig(ENV_MINIMO).SEG_MFA_MAX_EDAD_SEG).toBe(900);
    expect(cargarConfig({ ...ENV_MINIMO, SEG_MFA_MAX_EDAD_SEG: '60' }).SEG_MFA_MAX_EDAD_SEG).toBe(60);
    expect(() => cargarConfig({ ...ENV_MINIMO, SEG_MFA_MAX_EDAD_SEG: '0' })).toThrow(/SEG_MFA_MAX_EDAD_SEG/);
  });
});
