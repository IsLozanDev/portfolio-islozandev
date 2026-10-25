import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ENTIDADES_EVT } from '@vitrina/plataforma/eventos';
import { cargarConfig } from './config/env.js';
import { WorkerModule } from './worker.module.js';

const config = cargarConfig();

const dataSource = new DataSource({ type: 'postgres', url: config.DATABASE_URL, entities: ENTIDADES_EVT });
await dataSource.initialize();

// Sin HTTP: relay del outbox y consumidores. SIGTERM detiene el ciclo y espera los trabajos en curso.
const app = await NestFactory.createApplicationContext(WorkerModule.register(dataSource, config));
app.enableShutdownHooks();
