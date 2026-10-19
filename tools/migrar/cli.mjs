import { bajar, subir } from './migrar.mjs';

const [comando, dir = 'db'] = process.argv.slice(2);
const url = process.env.DATABASE_URL;

if (!url) {
  console.error('Falta DATABASE_URL. Copia .env.example a .env.');
  process.exit(1);
}
if (!['up', 'down'].includes(comando)) {
  console.error('Uso: cli.mjs <up|down> [directorio]');
  process.exit(1);
}

try {
  const hechas = await (comando === 'up' ? subir : bajar)({ url, dir });
  console.log(`${comando}: ${hechas.length} migración(es)${hechas.length ? ` (${hechas.join(', ')})` : ''}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
