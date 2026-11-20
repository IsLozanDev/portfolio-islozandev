import 'reflect-metadata';
import { ejecutarReenvolturaCli } from './secretos.cli.js';

process.exitCode = await ejecutarReenvolturaCli(process.argv.slice(2), process.env, console);
