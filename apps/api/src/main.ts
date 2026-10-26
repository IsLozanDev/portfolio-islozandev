import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ENTIDADES_SEQ, registrarEsquemasSeq } from '@vitrina/plataforma/correlativos';
import { ENTIDADES_EVT } from '@vitrina/plataforma/eventos';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { registrarEsquemasOrg } from '@vitrina/plataforma/org';
import { ENTIDADES_CFG, registrarEsquemasCfg } from '@vitrina/plataforma/parametros';
import { registrarEsquemasSeg } from '@vitrina/plataforma/seguridad';
import { AppModule } from './app.module.js';
import { configurarApp } from './app.setup.js';
import { cargarConfig } from './config/env.js';

const config = cargarConfig();

const dataSource = new DataSource({ type: 'postgres', url: config.DATABASE_URL, entities: [...ENTIDADES_CFG, ...ENTIDADES_SEQ, ...ENTIDADES_EVT] });
await dataSource.initialize();

const validator = new InMemoryEventSchemaValidator();
registrarEsquemasOrg(validator);
registrarEsquemasSeg(validator);
registrarEsquemasCfg(validator);
registrarEsquemasSeq(validator);

const app = await NestFactory.create(
  AppModule.register({
    dataSource,
    validator,
    supabaseUrl: config.SUPABASE_URL,
    mfaMaxEdadSeg: config.SEG_MFA_MAX_EDAD_SEG,
    redisUrl: config.REDIS_URL,
    invitaciones: { supabaseSecretKey: config.SUPABASE_SECRET_KEY, url: config.SEG_URL_INVITACION, horas: config.SEG_INVITACION_HORAS },
    reintentosEventos: { intentos: config.EVT_INTENTOS, esperaBaseMs: config.EVT_BACKOFF_MS, esperaMaximaMs: config.EVT_BACKOFF_MAX_MS },
    tenantOperador: config.ORG_TENANT_OPERADOR,
  }),
);
configurarApp(app);
await app.listen(config.PORT);
