import 'reflect-metadata';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CALENDARIO_PORT } from '@vitrina/plataforma/catalogos';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { PADRON_RUC, RegistrarEmpresa } from '@vitrina/plataforma/org';
import { PARAMETRO_PORT, ParametrosModule } from '@vitrina/plataforma/parametros';
import { REGISTRO_ACCESO } from '@vitrina/plataforma/seguridad';
import { BOVEDA_SECRETOS, BovedaNoConfiguradaError, type BovedaSecretos } from '@vitrina/plataforma/secretos';
import { TENANT_CONTEXT } from '@vitrina/plataforma/kernel-infra';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import { AppModule } from '../src/app.module.js';
import { PadronRucIdentidad } from '../src/identidad/padron-ruc.identidad.js';
import { AltaTenant } from '../src/org/alta-tenant.js';
import { configurarApp } from '../src/app.setup.js';
import { cargarConfig } from '../src/config/env.js';

const SUPABASE_URL = 'https://proyecto-prueba.supabase.co';
const ENV_MINIMO = {
  DATABASE_URL: 'postgres://localhost:5432/vitrina',
  SUPABASE_URL,
  REDIS_URL: 'redis://localhost:6379',
  SUPABASE_SECRET_KEY: 'sb_secret_prueba',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_prueba',
  SEG_URL_INVITACION: 'http://127.0.0.1:4200/auth/invitacion',
};

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
      // lazyConnect: estas pruebas no usan la caché y no abren conexión.
      redisUrl: 'redis://127.0.0.1:6379',
      jwksUrl: `http://127.0.0.1:${port}/auth/v1/.well-known/jwks.json`,
      invitaciones: { supabaseSecretKey: 'sb_secret_prueba', url: 'https://app.vitrina.pe/auth/invitacion' },
      reintentosEventos: { intentos: 8, esperaBaseMs: 5000, esperaMaximaMs: 600_000 },
      tenantOperador: 'plataforma',
      identidad: { proveedor: 'falso' as const, salDocumento: 'sal-de-prueba' },
      archivos: { bucket: 'archivos' },
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

  it('GET /v1/seg/mi-contexto sin token responde 401 TOKEN_INVALIDO', async () => {
    const res = await request(app.getHttpServer()).get('/v1/seg/mi-contexto');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ codigo: 'TOKEN_INVALIDO' });
  });

  it('GET /v1/seg/mi-contexto con un token sin tenant responde 403 SIN_TENANT', async () => {
    const res = await request(app.getHttpServer()).get('/v1/seg/mi-contexto').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ codigo: 'SIN_TENANT' });
  });

  it('GET /v1/seg/sesion ya no existe', async () => {
    const res = await request(app.getHttpServer()).get('/v1/seg/sesion').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('GET /v1/docs-json publica /v1/salud y /v1/seg/mi-contexto con bearer auth y X-Sucursal-Id', async () => {
    const res = await request(app.getHttpServer()).get('/v1/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.paths['/v1/salud'].get).toBeDefined();
    expect(res.body.paths['/v1/seg/sesion']).toBeUndefined();
    const miContexto = res.body.paths['/v1/seg/mi-contexto'].get;
    expect(miContexto.security).toEqual([{ bearer: [] }]);
    expect(miContexto.parameters).toContainEqual(expect.objectContaining({ name: 'X-Sucursal-Id', in: 'header', required: false }));
    expect(res.body.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('GET /v1/docs-json publica las 7 rutas de membresías (spec 08) y la pública no pide token', async () => {
    const { paths } = (await request(app.getHttpServer()).get('/v1/docs-json')).body;
    for (const [ruta, metodo] of [
      ['/v1/seg/invitaciones', 'post'],
      ['/v1/seg/invitaciones/{token}', 'get'],
      ['/v1/seg/invitaciones/aceptar', 'post'],
      ['/v1/seg/membresias/{id}/suspender', 'post'],
      ['/v1/seg/membresias/{id}/reactivar', 'post'],
      ['/v1/seg/membresias/{id}/finalizar', 'post'],
      ['/v1/seg/asignaciones/{id}/revocar', 'post'],
    ]) {
      expect(paths[ruta]?.[metodo]).toBeDefined();
    }
    expect(paths['/v1/seg/invitaciones/{token}'].get.security).toBeUndefined();
    expect(paths['/v1/seg/invitaciones/aceptar'].post.responses['410']).toBeDefined();
  });

  it('OrgModule queda cableado: los casos de uso de org se resuelven', () => {
    expect(app.get(RegistrarEmpresa)).toBeInstanceOf(RegistrarEmpresa);
  });

  it('spec 28b: ORG consulta el padrón RUC por IDN y no por el nulo', () => {
    expect(app.get(PADRON_RUC, { strict: false })).toBeInstanceOf(PadronRucIdentidad);
  });

  it('spec 28b: OpenAPI documenta advertencias en EmpresaRegistradaDto y TenantDadoDeAltaDto', async () => {
    const { components } = (await request(app.getHttpServer()).get('/v1/docs-json')).body;
    for (const esquema of ['EmpresaRegistradaDto', 'TenantDadoDeAltaDto']) {
      expect(components.schemas[esquema].properties.advertencias).toMatchObject({ type: 'array', items: { type: 'string' } });
      expect(components.schemas[esquema].required).toContain('advertencias');
    }
  });

  it('GET /v1/docs-json publica POST /v1/org/tenants (spec 12) con bearer auth y sus códigos de error', async () => {
    const { paths } = (await request(app.getHttpServer()).get('/v1/docs-json')).body;
    const alta = paths['/v1/org/tenants']?.post;
    expect(alta?.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(alta.responses).sort()).toEqual(['201', '400', '401', '403', '409', '503']);
  });

  it('AltaTenant queda cableado con org, seguridad, correlativos y parámetros', () => {
    expect(app.get(AltaTenant)).toBeInstanceOf(AltaTenant);
  });

  it('cargarConfig toma plataforma como tenant operador por defecto', () => {
    expect(cargarConfig(ENV_MINIMO).ORG_TENANT_OPERADOR).toBe('plataforma');
    expect(cargarConfig({ ...ENV_MINIMO, ORG_TENANT_OPERADOR: 'operador-dev' }).ORG_TENANT_OPERADOR).toBe('operador-dev');
  });

  it('GET /v1/docs-json publica las 4 rutas de parámetros (spec 09) con bearer auth', async () => {
    const { paths } = (await request(app.getHttpServer()).get('/v1/docs-json')).body;
    for (const [ruta, metodo] of [
      ['/v1/cfg/parametros', 'get'],
      ['/v1/cfg/parametros/{codigo}', 'get'],
      ['/v1/cfg/parametros/{codigo}/valores', 'put'],
      ['/v1/cfg/parametros/{codigo}/valores', 'delete'],
    ]) {
      expect(paths[ruta]?.[metodo]?.security).toEqual([{ bearer: [] }]);
    }
  });

  it('GET /v1/docs-json publica las 5 rutas del spec 19c con bearer auth', async () => {
    const { paths } = (await request(app.getHttpServer()).get('/v1/docs-json')).body;
    for (const [ruta, metodo] of [
      ['/v1/feriados', 'get'],
      ['/v1/feriados', 'post'],
      ['/v1/feriados/{id}', 'put'],
      ['/v1/feriados/{id}', 'delete'],
      ['/v1/catalogos/{codigo}/items/administracion', 'get'],
    ]) {
      expect(paths[ruta]?.[metodo]?.security).toEqual([{ bearer: [] }]);
    }
  });

  it('ParametrosModule queda cableado: ParametroPort se resuelve con el AlcanceActor global de seg', () => {
    expect(app.get(PARAMETRO_PORT)).toBeInstanceOf(Object);
    expect(typeof app.get(PARAMETRO_PORT).valor).toBe('function');
  });

  it('CalendarioPort queda cableado y ParametrosModule se instancia una sola vez (spec 19c)', () => {
    expect(typeof app.get(CALENDARIO_PORT).sumarDiasHabiles).toBe('function');
    const instancias = [...app.get(ModulesContainer).values()].filter((modulo) => modulo.metatype === ParametrosModule);
    expect(instancias).toHaveLength(1);
  });

  it('GET /v1/cfg/parametros sin token responde 401', async () => {
    expect((await request(app.getHttpServer()).get('/v1/cfg/parametros')).status).toBe(401);
  });

  it('spec 41: la bóveda queda cableada y, sin claves maestras, falla al usarse', async () => {
    const boveda = app.get<BovedaSecretos>(BOVEDA_SECRETOS);
    const contexto = app.get<TenantContext>(TENANT_CONTEXT);

    await expect(contexto.run({ tenantId: 't', actorId: 'u' }, () => boveda.leer('s'))).rejects.toThrow(BovedaNoConfiguradaError);
  });

  it('spec 41: en production sin claves maestras, con una clave que no es de 32 bytes o con la activa fuera de la lista, no arranca', () => {
    const produccion = { ...ENV_MINIMO, APP_ENV: 'production', RESEND_API_KEY: 're_prueba', RESEND_WEBHOOK_SECRET: 'whsec_prueba', NOT_REMITENTE: 'Vitrina <a@vitrina.pe>', NOT_SAL_DESTINO: 'n'.repeat(32), OBS_SAL_DOCUMENTO: 's'.repeat(32), IDN_PROVEEDOR: 'decolecta', IDN_DECOLECTA_TOKEN: 'token' };
    const clave = Buffer.alloc(32, 7).toString('base64');

    expect(() => cargarConfig(produccion)).toThrow('SEC_CLAVES_MAESTRAS: custom; SEC_CLAVE_ACTIVA: custom');
    expect(() => cargarConfig({ ...produccion, SEC_CLAVES_MAESTRAS: `1:${Buffer.alloc(16).toString('base64')}`, SEC_CLAVE_ACTIVA: '1' })).toThrow('SEC_CLAVES_MAESTRAS');
    expect(() => cargarConfig({ ...produccion, SEC_CLAVES_MAESTRAS: `1:${clave}`, SEC_CLAVE_ACTIVA: '2' })).toThrow('SEC_CLAVES_MAESTRAS');
    expect(() => cargarConfig({ ...produccion, SEC_CLAVES_MAESTRAS: `1:${clave}`, SEC_CLAVE_ACTIVA: '2' })).not.toThrow(clave);
    expect(cargarConfig({ ...produccion, SEC_CLAVES_MAESTRAS: `1:${clave}`, SEC_CLAVE_ACTIVA: '1' }).SEC_CLAVE_ACTIVA).toBe(1);
    expect(cargarConfig(ENV_MINIMO).SEC_CLAVES_MAESTRAS).toBeUndefined();
  });

  it('cargarConfig rechaza un PORT inválido', () => {
    expect(() => cargarConfig({ ...ENV_MINIMO, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('cargarConfig exige DATABASE_URL postgres y no repite su valor en el error', () => {
    expect(() => cargarConfig({ SUPABASE_URL, REDIS_URL: ENV_MINIMO.REDIS_URL })).toThrow(/DATABASE_URL/);
    expect(() => cargarConfig({ SUPABASE_URL, REDIS_URL: ENV_MINIMO.REDIS_URL, DATABASE_URL: 'mysql://usuario:clave-secreta@host/db' })).toThrow(/DATABASE_URL/);
    expect(() => cargarConfig({ SUPABASE_URL, REDIS_URL: ENV_MINIMO.REDIS_URL, DATABASE_URL: 'mysql://usuario:clave-secreta@host/db' })).not.toThrow(/clave-secreta/);
    expect(cargarConfig(ENV_MINIMO).DATABASE_URL).toBe('postgres://localhost:5432/vitrina');
  });

  it('cargarConfig exige REDIS_URL redis o rediss', () => {
    expect(() => cargarConfig({ DATABASE_URL: ENV_MINIMO.DATABASE_URL, SUPABASE_URL })).toThrow(/REDIS_URL/);
    expect(() => cargarConfig({ ...ENV_MINIMO, REDIS_URL: 'http://localhost:6379' })).toThrow(/REDIS_URL/);
    expect(cargarConfig({ ...ENV_MINIMO, REDIS_URL: 'rediss://cache:6380' }).REDIS_URL).toBe('rediss://cache:6380');
  });

  it('cargarConfig exige SUPABASE_URL y toma SEG_MFA_MAX_EDAD_SEG con 900 por defecto', () => {
    expect(() => cargarConfig({ DATABASE_URL: ENV_MINIMO.DATABASE_URL, REDIS_URL: ENV_MINIMO.REDIS_URL })).toThrow(/SUPABASE_URL/);
    expect(cargarConfig(ENV_MINIMO).SEG_MFA_MAX_EDAD_SEG).toBe(900);
    expect(cargarConfig({ ...ENV_MINIMO, SEG_MFA_MAX_EDAD_SEG: '60' }).SEG_MFA_MAX_EDAD_SEG).toBe(60);
    expect(() => cargarConfig({ ...ENV_MINIMO, SEG_MFA_MAX_EDAD_SEG: '0' })).toThrow(/SEG_MFA_MAX_EDAD_SEG/);
  });

  it('cargarConfig exige la publishable key para el ingreso por la API (spec 18b)', () => {
    const { SUPABASE_PUBLISHABLE_KEY: _publica, ...sinPublica } = ENV_MINIMO;
    expect(() => cargarConfig(sinPublica)).toThrow(/SUPABASE_PUBLISHABLE_KEY/);
    expect(cargarConfig(ENV_MINIMO).SUPABASE_PUBLISHABLE_KEY).toBe('sb_publishable_prueba');
  });

  it('cargarConfig exige la secret key y la URL de invitación, y toma 72 h por defecto', () => {
    const { SUPABASE_SECRET_KEY: _clave, ...sinClave } = ENV_MINIMO;
    const { SEG_URL_INVITACION: _url, ...sinUrl } = ENV_MINIMO;
    expect(() => cargarConfig(sinClave)).toThrow(/SUPABASE_SECRET_KEY/);
    expect(() => cargarConfig({ ...ENV_MINIMO, SUPABASE_SECRET_KEY: 'sb_secret_x' })).not.toThrow(/sb_secret_x/);
    expect(() => cargarConfig(sinUrl)).toThrow(/SEG_URL_INVITACION/);
    expect(() => cargarConfig({ ...ENV_MINIMO, SEG_URL_INVITACION: 'ftp://x/invitacion' })).toThrow(/SEG_URL_INVITACION/);
    expect(cargarConfig(ENV_MINIMO).SEG_INVITACION_HORAS).toBe(72);
  });

  it('cargarConfig no arranca en producción con el proveedor de identidad falso o sin token, y no repite el token (spec 28)', () => {
    // Spec 41: en producción las claves maestras son obligatorias.
    const produccion = { ...ENV_MINIMO, APP_ENV: 'production', RESEND_API_KEY: 're_prueba', RESEND_WEBHOOK_SECRET: 'whsec_prueba', NOT_REMITENTE: 'Vitrina <a@vitrina.pe>', NOT_SAL_DESTINO: 'n'.repeat(32), OBS_SAL_DOCUMENTO: 's'.repeat(32), SEC_CLAVES_MAESTRAS: `1:${Buffer.alloc(32, 1).toString('base64')}`, SEC_CLAVE_ACTIVA: '1' };
    expect(cargarConfig(ENV_MINIMO).IDN_PROVEEDOR).toBe('falso');
    expect(() => cargarConfig(produccion)).toThrow(/IDN_PROVEEDOR/);
    expect(() => cargarConfig({ ...produccion, IDN_PROVEEDOR: 'falso', IDN_DECOLECTA_TOKEN: 'token-secreto' })).toThrow(/IDN_PROVEEDOR/);
    expect(() => cargarConfig({ ...produccion, IDN_PROVEEDOR: 'decolecta' })).toThrow(/IDN_DECOLECTA_TOKEN/);
    expect(() => cargarConfig({ ...produccion, IDN_PROVEEDOR: 'falso', IDN_DECOLECTA_TOKEN: 'token-secreto' })).not.toThrow(/token-secreto/);
    expect(cargarConfig({ ...produccion, IDN_PROVEEDOR: 'decolecta', IDN_DECOLECTA_TOKEN: 'token-secreto' }).IDN_PROVEEDOR).toBe('decolecta');
    expect(cargarConfig({ ...ENV_MINIMO, APP_ENV: 'staging', OBS_SAL_DOCUMENTO: 's'.repeat(32) }).IDN_PROVEEDOR).toBe('falso');
  });

  it('IdentidadModule queda cableado: /v1/identidad pide token y está en OpenAPI con bearer auth (spec 28)', async () => {
    const sinToken = await request(app.getHttpServer()).get('/v1/identidad/DNI/45781236?motivo=OTRO');
    expect([sinToken.status, sinToken.body]).toEqual([401, { codigo: 'TOKEN_INVALIDO' }]);
    const { paths } = (await request(app.getHttpServer()).get('/v1/docs-json')).body;
    expect(paths['/v1/identidad/{tipo}/{numero}'].get.security).toEqual([{ bearer: [] }]);
    expect(paths['/v1/identidad/{tipo}/{numero}/validez'].get.security).toEqual([{ bearer: [] }]);
  });

  it('PersonasModule queda cableado: /v1/personas pide token y sus cuatro rutas están en OpenAPI con bearer auth (spec 31)', async () => {
    const sinToken = await request(app.getHttpServer()).get('/v1/personas/busqueda?tipo=DNI&numero=45781236');
    expect([sinToken.status, sinToken.body]).toEqual([401, { codigo: 'TOKEN_INVALIDO' }]);
    const { paths } = (await request(app.getHttpServer()).get('/v1/docs-json')).body;
    expect(paths['/v1/personas/busqueda'].get.security).toEqual([{ bearer: [] }]);
    expect(paths['/v1/personas'].post.security).toEqual([{ bearer: [] }]);
    expect(paths['/v1/personas/{id}'].get.security).toEqual([{ bearer: [] }]);
    expect(paths['/v1/personas/{id}/roles'].post.security).toEqual([{ bearer: [] }]);
  });

  it('el listado de personas pide token y está en OpenAPI con bearer auth (spec 38)', async () => {
    const sinToken = await request(app.getHttpServer()).get('/v1/personas?q=quispe');
    expect([sinToken.status, sinToken.body]).toEqual([401, { codigo: 'TOKEN_INVALIDO' }]);
    const { paths } = (await request(app.getHttpServer()).get('/v1/docs-json')).body;
    expect(paths['/v1/personas'].get.security).toEqual([{ bearer: [] }]);
  });

  it('las siete rutas de edición de personas están en OpenAPI con bearer auth y piden token (spec 32)', async () => {
    const sinToken = await request(app.getHttpServer()).post('/v1/personas/0193f3a0-0000-7000-8000-000000000001/contactos').send({});
    expect([sinToken.status, sinToken.body]).toEqual([401, { codigo: 'TOKEN_INVALIDO' }]);
    const { paths } = (await request(app.getHttpServer()).get('/v1/docs-json')).body;
    const seguridad = [
      paths['/v1/personas/{id}'].patch,
      paths['/v1/personas/{id}/contactos'].post,
      paths['/v1/personas/{id}/contactos/{contactoId}'].patch,
      paths['/v1/personas/{id}/contactos/{contactoId}'].delete,
      paths['/v1/personas/{id}/direcciones'].post,
      paths['/v1/personas/{id}/direcciones/{direccionId}'].patch,
      paths['/v1/personas/{id}/direcciones/{direccionId}'].delete,
    ].map((operacion) => operacion.security);
    expect(seguridad).toEqual(Array(7).fill([{ bearer: [] }]));
  });

  it('las cinco rutas de consentimientos están en OpenAPI con bearer auth y piden token (spec 37)', async () => {
    const sinToken = await request(app.getHttpServer()).get('/v1/consentimientos/textos');
    expect([sinToken.status, sinToken.body]).toEqual([401, { codigo: 'TOKEN_INVALIDO' }]);
    const { paths } = (await request(app.getHttpServer()).get('/v1/docs-json')).body;
    const seguridad = [
      paths['/v1/personas/{id}/consentimientos'].get,
      paths['/v1/personas/{id}/consentimientos'].post,
      paths['/v1/personas/{id}/consentimientos/{finalidad}/revocar'].post,
      paths['/v1/consentimientos/textos'].get,
      paths['/v1/consentimientos/textos'].post,
    ].map((operacion) => operacion.security);
    expect(seguridad).toEqual(Array(5).fill([{ bearer: [] }]));
  });

  it('ArchivosModule queda cableado: /v1/archivos pide token y sus cuatro rutas están en OpenAPI con bearer auth (spec 33)', async () => {
    const sinToken = await request(app.getHttpServer()).get('/v1/archivos/0193f3a0-0000-7000-8000-0000000000a1');
    expect([sinToken.status, sinToken.body]).toEqual([401, { codigo: 'TOKEN_INVALIDO' }]);
    const { paths } = (await request(app.getHttpServer()).get('/v1/docs-json')).body;
    expect(paths['/v1/archivos/cargas'].post.security).toEqual([{ bearer: [] }]);
    expect(paths['/v1/archivos/{id}/confirmar'].post.security).toEqual([{ bearer: [] }]);
    expect(paths['/v1/archivos/{id}'].get.security).toEqual([{ bearer: [] }]);
    expect(paths['/v1/archivos/{id}/descarga'].get.security).toEqual([{ bearer: [] }]);
  });
});
