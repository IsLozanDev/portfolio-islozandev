import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ENTIDADES_EVT } from '@vitrina/plataforma/eventos';
import { ENTIDADES_ORG } from '@vitrina/plataforma/org';
import { ENTIDADES_CFG } from '@vitrina/plataforma/parametros';
import { ENTIDADES_SEG_LECTURA, ENTIDADES_SEG_SOPORTE } from '@vitrina/plataforma/seguridad';
import { cargarConfig } from './config/env.js';
import { WorkerModule } from './worker.module.js';

const config = cargarConfig();

const dataSource = new DataSource({ type: 'postgres', url: config.DATABASE_URL, entities: [...ENTIDADES_EVT, ...ENTIDADES_ORG, ...ENTIDADES_CFG, ...ENTIDADES_SEG_LECTURA, ...ENTIDADES_SEG_SOPORTE] });
await dataSource.initialize();

// Sin HTTP: relay del outbox, consumidores, tarea diaria de vencimientos y vencimiento de soporte cada minuto. SIGTERM detiene el ciclo y espera los trabajos en curso.
const app = await NestFactory.createApplicationContext(WorkerModule.register(dataSource, config));
app.enableShutdownHooks();
