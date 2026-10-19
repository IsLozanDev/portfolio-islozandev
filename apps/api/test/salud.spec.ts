import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { cargarConfig } from '../src/config/env.js';

describe('api', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /v1/salud responde 200', async () => {
    const res = await request(app.getHttpServer()).get('/v1/salud');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok' });
  });

  it('GET /v1/docs-json publica /v1/salud en el OpenAPI', async () => {
    const res = await request(app.getHttpServer()).get('/v1/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.paths['/v1/salud'].get).toBeDefined();
  });

  it('cargarConfig rechaza un PORT inválido', () => {
    expect(() => cargarConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
