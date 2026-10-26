import 'reflect-metadata';
import { sembrarPlataformaCli } from './plataforma.cli.js';

process.exitCode = await sembrarPlataformaCli(process.argv.slice(2), process.env, console);
