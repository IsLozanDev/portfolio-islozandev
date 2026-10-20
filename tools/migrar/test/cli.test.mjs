import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const cli = new URL('../cli.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const entornoLimpio = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };

const correr = (args, env) =>
  exec('node', [cli, ...args], { env: { ...entornoLimpio, ...env } }).then(
    () => ({ codigo: 0, salida: '' }),
    (error) => ({ codigo: error.code, salida: error.stderr }),
  );

describe('cli de migraciones', () => {
  test('sin --remoto exige DATABASE_URL aunque exista DATABASE_MIGRATION_URL', async () => {
    const r = await correr(['up'], { DATABASE_MIGRATION_URL: 'postgres://x:y@remoto.invalid:5432/postgres' });
    expect(r.codigo).toBe(1);
    expect(r.salida).toMatch(/Falta DATABASE_URL/);
  });

  test('con --remoto exige DATABASE_MIGRATION_URL aunque exista DATABASE_URL', async () => {
    const r = await correr(['up', '--remoto'], { DATABASE_URL: 'postgres://x:y@local.invalid:5432/postgres' });
    expect(r.codigo).toBe(1);
    expect(r.salida).toMatch(/Falta DATABASE_MIGRATION_URL/);
  });

  test('comando desconocido muestra el uso', async () => {
    const r = await correr(['borrar'], { DATABASE_URL: 'postgres://x:y@local.invalid:5432/postgres' });
    expect(r.codigo).toBe(1);
    expect(r.salida).toMatch(/Uso: cli\.mjs/);
  });
});
