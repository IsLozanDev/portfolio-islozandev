import 'reflect-metadata';
import { ejecutarProgramacionesCli } from './programaciones.cli.js';

process.exitCode = await ejecutarProgramacionesCli(process.argv.slice(2), process.env, console);
