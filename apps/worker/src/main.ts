import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ENTIDADES_AUDITORIA } from '@vitrina/plataforma/auditoria';
import { ENTIDADES_CAT } from '@vitrina/plataforma/catalogos';
import { ENTIDADES_EVT, LectorEstadoOutboxTypeOrm } from '@vitrina/plataforma/eventos';
import { ENTIDADES_ORG } from '@vitrina/plataforma/org';
import { ENTIDADES_CFG } from '@vitrina/plataforma/parametros';
import { registrarMetricasOutbox, usarLoggerDeObservabilidad } from '@vitrina/plataforma/observabilidad';
import { ENTIDADES_SEG_LECTURA, ENTIDADES_SEG_SOPORTE } from '@vitrina/plataforma/seguridad';
import { cargarConfig } from './config/env.js';
import { WorkerModule } from './worker.module.js';

const config = cargarConfig();

const dataSource = new DataSource({ type: 'postgres', url: config.DATABASE_URL, entities: [...ENTIDADES_CAT, ...ENTIDADES_EVT, ...ENTIDADES_ORG, ...ENTIDADES_CFG, ...ENTIDADES_SEG_LECTURA, ...ENTIDADES_SEG_SOPORTE, ...ENTIDADES_AUDITORIA] });
await dataSource.initialize();

// Sin HTTP: relay del outbox, consumidores, tarea diaria de vencimientos, vencimiento de soporte cada minuto e importaciones de catálogos. SIGTERM detiene el ciclo y espera los trabajos en curso.
const app = await NestFactory.createApplicationContext(WorkerModule.register(dataSource, config), { bufferLogs: true });
usarLoggerDeObservabilidad(app);
// Spec 21: las métricas del outbox solo se leen si OpenTelemetry está activo.
const loggerMetricas = new Logger('MetricasOutbox');
registrarMetricasOutbox(new LectorEstadoOutboxTypeOrm(dataSource), (error) =>
  loggerMetricas.warn({ mensaje: 'No se pudo leer el estado del outbox', error: error instanceof Error ? error.name : typeof error }),
);
app.enableShutdownHooks();
