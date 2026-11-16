import 'reflect-metadata';
import { ejecutarCuotasCli } from './cuotas.cli.js';

process.exitCode = await ejecutarCuotasCli(process.argv.slice(2), process.env, console);
