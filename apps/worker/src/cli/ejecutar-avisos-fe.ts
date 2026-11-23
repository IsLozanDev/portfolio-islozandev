import 'reflect-metadata';
import { ejecutarAvisosFeCli } from './certificados-fe.cli.js';

process.exitCode = await ejecutarAvisosFeCli(process.argv.slice(2), process.env, console);
