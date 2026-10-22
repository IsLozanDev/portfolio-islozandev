import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { bajar, subir } from '../migrar.mjs';

// Crea bases temporales: solo con TEST_DATABASE_URL (CI), nunca contra la DATABASE_URL de .env.
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
const describeConDb = ADMIN_URL ? describe : describe.skip;
const fixture = (nombre) => new URL(`./fixtures/${nombre}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const nombreDb = `migrar_test_${randomBytes(4).toString('hex')}`;
const urlDb = (() => {
  if (!ADMIN_URL) return '';
  const u = new URL(ADMIN_URL);
  u.pathname = `/${nombreDb}`;
  return u.toString();
})();

async function admin(sql) {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

async function consultar(sql) {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    return (await c.query(sql)).rows;
  } finally {
    await c.end();
  }
}

const existeEsquema = async (n) => (await consultar(`SELECT 1 FROM pg_namespace WHERE nspname = '${n}'`)).length === 1;

beforeAll(() => ADMIN_URL && admin(`CREATE DATABASE ${nombreDb}`));
afterAll(() => ADMIN_URL && admin(`DROP DATABASE IF EXISTS ${nombreDb} WITH (FORCE)`));

describeConDb('runner de migraciones', () => {
  test('up, down, up aplica y revierte en orden inverso', async () => {
    const dir = fixture('ok');
    expect(await subir({ url: urlDb, dir })).toEqual(['001_a.sql', '002_b.sql']);
    expect(await existeEsquema('fx_a')).toBe(true);
    expect(await subir({ url: urlDb, dir })).toEqual([]);

    expect(await bajar({ url: urlDb, dir })).toEqual(['002_b.sql', '001_a.sql']);
    expect(await existeEsquema('fx_a')).toBe(false);
    expect(await consultar('SELECT * FROM migraciones._migraciones')).toEqual([]);

    expect(await subir({ url: urlDb, dir })).toEqual(['001_a.sql', '002_b.sql']);
    await bajar({ url: urlDb, dir });
  });

  test('down de un directorio no toca las migraciones de otro', async () => {
    await subir({ url: urlDb, dir: fixture('ok') });
    expect(await subir({ url: urlDb, dir: fixture('otro') })).toEqual(['010_c.sql']);

    expect(await bajar({ url: urlDb, dir: fixture('otro') })).toEqual(['010_c.sql']);
    expect(await existeEsquema('fx_c')).toBe(false);
    expect(await existeEsquema('fx_a')).toBe(true);

    expect(await bajar({ url: urlDb, dir: fixture('ok') })).toEqual(['002_b.sql', '001_a.sql']);
  });

  test('falta el script inverso: falla y no aplica nada', async () => {
    await expect(subir({ url: urlDb, dir: fixture('sin-inverso') })).rejects.toThrow(/Falta el script inverso.*001_x\.sql/);
    expect(await existeEsquema('fx_x')).toBe(false);
  });

  test('un SQL que falla se revierte completo y no se registra', async () => {
    await expect(subir({ url: urlDb, dir: fixture('falla') })).rejects.toThrow(/Falló 001_bad\.sql/);
    expect(await existeEsquema('fx_f')).toBe(false);
    expect(await consultar('SELECT * FROM migraciones._migraciones')).toEqual([]);
  });

  test('directorio inexistente se trata como vacío', async () => {
    expect(await subir({ url: urlDb, dir: fixture('no-existe') })).toEqual([]);
  });
});
