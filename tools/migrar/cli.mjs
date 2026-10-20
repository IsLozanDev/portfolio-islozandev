import { bajar, subir } from './migrar.mjs';

const args = process.argv.slice(2);
const remoto = args.includes('--remoto');
const [comando, dir = 'db'] = args.filter((a) => !a.startsWith('--'));
const variable = remoto ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
const url = process.env[variable];

if (!url) {
  console.error(`Falta ${variable}. Copia .env.example a .env.`);
  process.exit(1);
}
if (!['up', 'down'].includes(comando)) {
  console.error('Uso: cli.mjs <up|down> [directorio] [--remoto]');
  process.exit(1);
}

if (remoto) {
  const { host, pathname } = new URL(url);
  console.log(`Destino remoto: ${host}${pathname}`);
}

try {
  const hechas = await (comando === 'up' ? subir : bajar)({ url, dir });
  console.log(`${comando}: ${hechas.length} migración(es)${hechas.length ? ` (${hechas.join(', ')})` : ''}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
