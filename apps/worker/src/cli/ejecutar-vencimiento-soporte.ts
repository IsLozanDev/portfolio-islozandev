import 'reflect-metadata';
import { ejecutarVencimientoSoporteCli } from './soporte.cli.js';

process.exitCode = await ejecutarVencimientoSoporteCli(process.argv.slice(2), process.env, console);
