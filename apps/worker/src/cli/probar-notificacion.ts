import 'reflect-metadata';
import { ejecutarNotificacionesCli } from './notificaciones.cli.js';

process.exitCode = await ejecutarNotificacionesCli(process.argv.slice(2), process.env, console);
