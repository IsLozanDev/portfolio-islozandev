import { aplicarManifiestoCli } from './manifiesto.cli.js';

process.exitCode = await aplicarManifiestoCli(process.argv.slice(2), process.env, console);
