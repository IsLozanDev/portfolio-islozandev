import 'reflect-metadata';
import { ejecutarVencimientosCli } from './vencimientos.cli.js';

process.exitCode = await ejecutarVencimientosCli(process.argv.slice(2), process.env, console);
