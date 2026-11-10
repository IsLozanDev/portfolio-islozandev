import 'reflect-metadata';
import { ejecutarAuditoriaCli } from './auditoria.cli.js';

process.exitCode = await ejecutarAuditoriaCli(process.argv.slice(2), process.env, console);
