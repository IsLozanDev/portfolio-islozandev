import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { RegistrarEmpresa } from '@vitrina/plataforma/org';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { cargarConfig } from '../src/config/env.js';

describe('api', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Sin initialize(): estas pruebas no tocan la base.
    const opciones = { dataSource: new DataSource({ type: 'postgres' }), validator: new InMemoryEventSchemaValidator() };
    const modulo = await Test.createTestingModule({ imports: [AppModule.register(opciones)] }).compile();
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

  it('OrgModule queda cableado: los casos de uso de org se resuelven', () => {
    expect(app.get(RegistrarEmpresa)).toBeInstanceOf(RegistrarEmpresa);
  });

  it('cargarConfig rechaza un PORT inválido', () => {
    expect(() => cargarConfig({ PORT: 'abc', DATABASE_URL: 'postgres://localhost/vitrina' })).toThrow(/PORT/);
  });

  it('cargarConfig exige DATABASE_URL postgres y no repite su valor en el error', () => {
    expect(() => cargarConfig({})).toThrow(/DATABASE_URL/);
    expect(() => cargarConfig({ DATABASE_URL: 'mysql://usuario:clave-secreta@host/db' })).toThrow(/DATABASE_URL/);
    expect(() => cargarConfig({ DATABASE_URL: 'mysql://usuario:clave-secreta@host/db' })).not.toThrow(/clave-secreta/);
    expect(cargarConfig({ DATABASE_URL: 'postgres://localhost:5432/vitrina' }).DATABASE_URL).toBe('postgres://localhost:5432/vitrina');
  });
});
