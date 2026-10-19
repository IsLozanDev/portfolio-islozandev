import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configurarApp } from './app.setup.js';
import { cargarConfig } from './config/env.js';

const config = cargarConfig();
const app = await NestFactory.create(AppModule);
configurarApp(app);
await app.listen(config.PORT);
